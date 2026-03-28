import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import config from './env';
import { JwtPayload } from '../mdules/user/users.types';
import { createBullMQConnection } from './redis.config';
import { createMarketEventSubscriber } from './realtimeBus';
import orderbookService from '../prediction-modules/orderbook/order.service';
import { OrderOutcome } from '../prediction-modules/orderbook/order.types';
import { placeOrderSchema, cancelOrderSchema } from '../prediction-modules/orderbook/order.validators';
import { Market } from '../prediction-modules/markets/market.model';
import { Trade } from '../prediction-modules/trades/trade.model';
import { AmmPool } from '../prediction-modules/amm_pools/amm.model';

export const marketRoom = (marketId: string): string => `market:${marketId}`;
export const matchChannel = (matchId: string): string => `match:${matchId}`;

type SocketUser = { id: string; mobile: string; role: string };
type AuthedSocket = Socket & { data: { user?: SocketUser; eventWindow?: { count: number; resetAt: number } } };

const joinMarketSchema = Joi.object({
  marketId: Joi.string().trim().pattern(/^[a-fA-F0-9]{24}$/).required(),
});

const leaveMarketSchema = Joi.object({
  marketId: Joi.string().trim().pattern(/^[a-fA-F0-9]{24}$/).required(),
});

const isRateLimited = (socket: AuthedSocket, maxPerWindow = 30, windowMs = 10_000): boolean => {
  const now = Date.now();
  const win = socket.data.eventWindow;
  if (!win || now > win.resetAt) {
    socket.data.eventWindow = { count: 1, resetAt: now + windowMs };
    return false;
  }
  win.count += 1;
  return win.count > maxPerWindow;
};

const authFromSocket = (socket: Socket): SocketUser => {
  const authToken = (socket.handshake.auth?.token as string | undefined)?.trim();
  const headerToken = socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
  const queryToken = (socket.handshake.query?.token as string | undefined)?.trim();
  const token = authToken || headerToken || queryToken;
  if (!token) throw new Error('Authentication token missing');

  const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
  return { id: payload.sub, mobile: payload.mobile, role: String(payload.role) };
};

const buildJoinSyncPayload = async (marketId: string) => {
  const [market, pool, orderbookYes, orderbookNo, recentTrades] = await Promise.all([
    Market.findById(marketId).lean(),
    AmmPool.findOne({ marketId }).lean(),
    orderbookService.getOrderBook(marketId, OrderOutcome.YES, 20),
    orderbookService.getOrderBook(marketId, OrderOutcome.NO, 20),
    Trade.find({ marketId }).sort({ executedAt: -1 }).limit(20).lean(),
  ]);

  return {
    marketId,
    status: market?.status ?? 'UNKNOWN',
    currentPrice: {
      yes: pool?.priceYes ?? null,
      no: pool?.priceNo ?? null,
    },
    orderbook: {
      yes: orderbookYes,
      no: orderbookNo,
    },
    recentTrades: recentTrades.map((t: any) => ({
      tradeId: String(t._id),
      outcome: t.outcome,
      price: t.price,
      quantity: t.quantity,
      executedAt: t.executedAt,
      tradeType: t.tradeType,
    })),
  };
};

export const attachWebSocketServer = (httpServer: HttpServer): void => {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // JWT auth middleware
  io.use((socket, next) => {
    try {
      const user = authFromSocket(socket);
      (socket as AuthedSocket).data.user = user;
      next();
    } catch (err) {
      next(new Error(err instanceof Error ? err.message : 'Unauthorized'));
    }
  });

  // Realtime market events from Redis Pub/Sub (for horizontal scaling)
  const marketEventsSub = createMarketEventSubscriber();
  marketEventsSub
    .subscribe((evt) => {
      io.to(marketRoom(evt.marketId)).emit(evt.event, evt.payload);
    })
    .catch((err) => {
      console.error('🔴 Failed to subscribe market events:', err);
    });

  // Legacy score feed bridge: match:<id> Redis channels -> Socket.io room market:<id> (match_event)
  const legacySub = createBullMQConnection();
  legacySub.on('pmessage', (_pattern, channel, message) => {
    const parts = channel.split(':');
    const matchId = parts[0] === 'match' ? parts[1] : null;
    if (!matchId) return;
    try {
      const payload = JSON.parse(message);
      io.to(marketRoom(matchId)).emit('match_event', payload);
    } catch {
      io.to(marketRoom(matchId)).emit('match_event', message);
    }
  });
  legacySub.psubscribe('match:*').catch((err: Error) => {
    console.error('🔴 Failed to subscribe legacy match channels:', err.message);
  });

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as AuthedSocket;

    socket.emit('connected', {
      socketId: socket.id,
      userId: socket.data.user?.id,
      message: 'Connected to realtime trading gateway.',
    });

    socket.on('join_market', async (payload: unknown) => {
      if (isRateLimited(socket)) return socket.emit('error_event', { message: 'Rate limit exceeded' });
      const { error, value } = joinMarketSchema.validate(payload);
      if (error) return socket.emit('error_event', { message: error.details.map((d) => d.message).join('; ') });

      const room = marketRoom(value.marketId);
      await socket.join(room);
      const snapshot = await buildJoinSyncPayload(value.marketId);
      socket.emit('market_sync', snapshot);
    });

    socket.on('leave_market', async (payload: unknown) => {
      if (isRateLimited(socket)) return socket.emit('error_event', { message: 'Rate limit exceeded' });
      const { error, value } = leaveMarketSchema.validate(payload);
      if (error) return socket.emit('error_event', { message: error.details.map((d) => d.message).join('; ') });
      await socket.leave(marketRoom(value.marketId));
      socket.emit('left_market', { marketId: value.marketId });
    });

    socket.on('place_order', async (payload: unknown) => {
      if (isRateLimited(socket)) return socket.emit('error_event', { message: 'Rate limit exceeded' });
      const { error, value } = placeOrderSchema.validate(payload, { stripUnknown: true });
      if (error) return socket.emit('error_event', { message: error.details.map((d) => d.message).join('; ') });
      try {
        const result = await orderbookService.placeOrder(socket.data.user!.id, {
          marketId: value.marketId,
          outcome: value.outcome,
          side: value.side,
          orderType: value.orderType,
          price: value.price,
          quantity: value.quantity,
        });
        socket.emit('order_placed', result);
      } catch (err) {
        socket.emit('error_event', { message: err instanceof Error ? err.message : 'Order placement failed' });
      }
    });

    socket.on('cancel_order', async (payload: unknown) => {
      if (isRateLimited(socket)) return socket.emit('error_event', { message: 'Rate limit exceeded' });
      const { error, value } = cancelOrderSchema.validate(payload, { stripUnknown: true });
      if (error) return socket.emit('error_event', { message: error.details.map((d) => d.message).join('; ') });
      try {
        const result = await orderbookService.cancelOrder(socket.data.user!.id, value);
        socket.emit('order_cancelled', result);
      } catch (err) {
        socket.emit('error_event', { message: err instanceof Error ? err.message : 'Order cancellation failed' });
      }
    });

    socket.on('disconnect', () => {
      // Socket.io handles room cleanup automatically.
    });
  });

  console.log(`🟢 Socket.io server attached on /socket.io (JWT auth enabled)`);
};
