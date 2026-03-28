import mongoose, { ClientSession, Types } from 'mongoose';
import redisClient from '../../config/redis.config';
import AppError from '../../utils/AppError';
import walletService from '../../mdules/wallet/wallet.service';
import { WalletTxnReason } from '../../mdules/wallet/wallet.types';
import { Market } from '../markets/market.model';
import { MarketStatus } from '../markets/market.types';
import holdingService from '../holdings/holding.service';
import ammService from '../amm_pools/amm.service';
import riskEngine from '../risk_controls/risk.engine';
import { Order, IOrder } from './order.model';
import { CancelOrderDTO, MatchExecution, OrderOutcome, OrderSide, OrderStatus, OrderType, PlaceOrderDTO } from './order.types';
import { Trade } from '../trades/trade.model';
import { TradeOutcome, TradeType } from '../trades/trade.types';
import { publishMarketEvent } from '../../config/realtimeBus';

const FEE_RATE = 0.01;
const LOCK_TTL_MS = 5000;
const MAX_MATCH_BATCH = 300;

const round = (v: number): number => Number(v.toFixed(8));

const withTransaction = async <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> => {
  const session = await mongoose.startSession();
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' },
  });
  try {
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const redisBookKey = (marketId: string, outcome: OrderOutcome, side: OrderSide): string =>
  `ob:${marketId}:${outcome}:${side.toLowerCase()}`;

const redisLockKey = (marketId: string, outcome: OrderOutcome): string =>
  `lock:match:${marketId}:${outcome}`;

const releaseLockLua = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

interface PlaceOrderOptions {
  disableAmmFallback?: boolean;
  cancelUnfilledRemainder?: boolean;
}

class OrderbookService {
  private toTradeOutcome(outcome: OrderOutcome): TradeOutcome {
    return outcome === OrderOutcome.YES ? TradeOutcome.YES : TradeOutcome.NO;
  }

  private async emitOrderbookUpdate(marketId: string, outcome: OrderOutcome): Promise<void> {
    const snapshot = await this.getOrderBook(marketId, outcome, 20);
    await publishMarketEvent(marketId, 'orderbook_update', {
      marketId,
      outcome,
      snapshot,
      updatedAt: new Date().toISOString(),
    });
  }

  private async emitExecutionEvents(
    marketId: string,
    outcome: OrderOutcome,
    executions: MatchExecution[]
  ): Promise<void> {
    for (const exec of executions) {
      await publishMarketEvent(marketId, 'trade_executed', {
        marketId,
        outcome,
        type: 'ORDER_BOOK',
        tradeId: exec.tradeId,
        quantity: exec.quantity,
        price: exec.price,
        buyerOrderId: exec.buyerOrderId,
        sellerOrderId: exec.sellerOrderId,
        executedAt: new Date().toISOString(),
      });
    }
  }

  private toObjectId(id: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) throw new AppError(`Invalid ${label}.`, 400);
    return new Types.ObjectId(id);
  }

  private async acquireBookLock(marketId: string, outcome: OrderOutcome): Promise<string> {
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const key = redisLockKey(marketId, outcome);
    const ok = await redisClient.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
    if (ok !== 'OK') throw new AppError('Order book is busy. Please retry.', 409);
    return token;
  }

  private async releaseBookLock(marketId: string, outcome: OrderOutcome, token: string): Promise<void> {
    const key = redisLockKey(marketId, outcome);
    try {
      await redisClient.eval(releaseLockLua, 1, key, token);
    } catch {
      // no-op
    }
  }

  private async ensureTradableMarket(marketId: string, session: ClientSession): Promise<void> {
    const market = await Market.findById(marketId).session(session);
    if (!market) throw new AppError('Market not found.', 404);
    if (market.status !== MarketStatus.OPEN) throw new AppError('Market is not open for trading.', 409);
    if (!market.orderBookEnabled) throw new AppError('Order book is disabled for this market.', 409);
    if (market.closeAt && market.closeAt.getTime() <= Date.now()) throw new AppError('Market has closed for trading.', 409);
  }

  private sideSort(side: OrderSide): Record<string, 1 | -1> {
    return side === OrderSide.BUY
      ? { price: -1, createdAt: 1 }
      : { price: 1, createdAt: 1 };
  }

  private isPriceMatch(taker: IOrder, maker: IOrder): boolean {
    if (taker.side === OrderSide.BUY) return taker.price >= maker.price;
    return taker.price <= maker.price;
  }

  private weightedAvg(oldAvg: number | null, oldQty: number, fillPrice: number, fillQty: number): number {
    const prevAvg = oldAvg ?? 0;
    const totalQty = oldQty + fillQty;
    if (totalQty <= 0) return 0;
    return round(((oldAvg ? prevAvg * oldQty : 0) + (fillPrice * fillQty)) / totalQty);
  }

  private updateOrderForFill(order: IOrder, fillQty: number, fillPrice: number): void {
    const oldFilled = order.filledQuantity;
    order.filledQuantity = round(order.filledQuantity + fillQty);
    order.remainingQuantity = round(Math.max(0, order.quantity - order.filledQuantity));
    order.averageFillPrice = this.weightedAvg(order.averageFillPrice, oldFilled, fillPrice, fillQty);
    if (order.remainingQuantity <= 0) order.status = OrderStatus.FILLED;
    else order.status = order.filledQuantity > 0 ? OrderStatus.PARTIAL : OrderStatus.OPEN;
  }

  private requiredLockAmount(side: OrderSide, orderType: OrderType, price: number, quantity: number): number {
    if (side !== OrderSide.BUY) return 0;
    const capPrice = orderType === OrderType.MARKET ? 0.99 : price;
    return round(capPrice * quantity * (1 + FEE_RATE));
  }

  private async ensureSellCapacity(
    userId: string,
    marketId: string,
    outcome: OrderOutcome,
    quantity: number,
    session: ClientSession
  ): Promise<void> {
    const holdings = await holdingService.getUserHoldings(userId, marketId, session);
    const pos = holdings.find((h) => h.outcome === this.toTradeOutcome(outcome));
    const owned = pos?.quantity ?? 0;

    const committedAgg = await Order.aggregate<{ committed: number }>([
      {
        $match: {
          userId: this.toObjectId(userId, 'userId'),
          marketId: this.toObjectId(marketId, 'marketId'),
          outcome,
          side: OrderSide.SELL,
          status: { $in: [OrderStatus.OPEN, OrderStatus.PARTIAL] },
        },
      },
      { $group: { _id: null, committed: { $sum: '$remainingQuantity' } } },
    ]).session(session);

    const committed = committedAgg[0]?.committed ?? 0;
    if (owned - committed < quantity) {
      throw new AppError(`Insufficient ${outcome} holdings to place sell order.`, 409);
    }
  }

  private async syncOrderToRedis(order: IOrder): Promise<void> {
    const key = redisBookKey(order.marketId.toString(), order.outcome, order.side);
    if (order.status === OrderStatus.OPEN || order.status === OrderStatus.PARTIAL) {
      const score =
        order.side === OrderSide.BUY
          ? -((order.price * 1_000_000_000) + (new Date(order.createdAt).getTime() / 1_000_000_000))
          : ((order.price * 1_000_000_000) + (new Date(order.createdAt).getTime() / 1_000_000_000));
      await redisClient.zadd(key, score.toString(), order._id.toString());
    } else {
      await redisClient.zrem(key, order._id.toString());
    }
  }

  private async executeWalletAndHoldingForFill(
    buyerOrder: IOrder,
    sellerOrder: IOrder,
    fillQty: number,
    tradePrice: number,
    session: ClientSession
  ): Promise<{ buyerDebit: number; sellerCredit: number; buyerFee: number; sellerFee: number }> {
    const gross = round(fillQty * tradePrice);
    const buyerFee = round(gross * FEE_RATE);
    const sellerFee = round(gross * FEE_RATE);
    const buyerDebit = round(gross + buyerFee);
    const sellerCredit = round(gross - sellerFee);

    const buyerReserveRate = buyerOrder.orderType === OrderType.MARKET ? 0.99 : buyerOrder.price;
    const buyerReservedForFill = round(fillQty * buyerReserveRate * (1 + FEE_RATE));

    await walletService.transferLockedToDebit(
      buyerOrder.userId.toString(),
      {
        amount: buyerDebit,
        referenceId: `ORDER:FILL:BUY:${buyerOrder._id.toString()}`,
        reason: WalletTxnReason.ORDER_EXECUTION,
        metadata: { orderId: buyerOrder._id.toString(), fillQty, tradePrice },
      },
      session
    );

    const refund = round(Math.max(0, buyerReservedForFill - buyerDebit));
    if (refund > 0) {
      await walletService.unlockBalance(
        buyerOrder.userId.toString(),
        {
          amount: refund,
          referenceId: `ORDER:FILL:REFUND:${buyerOrder._id.toString()}`,
          reason: WalletTxnReason.REFUND,
          metadata: { orderId: buyerOrder._id.toString(), fillQty, tradePrice },
        },
        session
      );
    }

    await walletService.creditBalance(
      sellerOrder.userId.toString(),
      {
        amount: sellerCredit,
        referenceId: `ORDER:FILL:SELL:${sellerOrder._id.toString()}`,
        reason: WalletTxnReason.TRADE,
        metadata: { orderId: sellerOrder._id.toString(), fillQty, tradePrice },
      },
      session
    );

    await holdingService.applyOrderBookExecution({
      buyerId: buyerOrder.userId.toString(),
      sellerId: sellerOrder.userId.toString(),
      marketId: buyerOrder.marketId.toString(),
      outcome: this.toTradeOutcome(buyerOrder.outcome),
      quantity: fillQty,
      buyerPrice: round(buyerDebit / fillQty),
      sellerPrice: round(sellerCredit / fillQty),
      session,
    });

    return { buyerDebit, sellerCredit, buyerFee, sellerFee };
  }

  private async matchOrder(session: ClientSession, takerOrder: IOrder): Promise<MatchExecution[]> {
    const oppositeSide = takerOrder.side === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const makers = await Order.find({
      marketId: takerOrder.marketId,
      outcome: takerOrder.outcome,
      side: oppositeSide,
      status: { $in: [OrderStatus.OPEN, OrderStatus.PARTIAL] },
      _id: { $ne: takerOrder._id },
    })
      .sort(this.sideSort(oppositeSide))
      .limit(MAX_MATCH_BATCH)
      .session(session);

    const executions: MatchExecution[] = [];

    for (const maker of makers) {
      if (takerOrder.remainingQuantity <= 0) break;
      if (!this.isPriceMatch(takerOrder, maker)) break;

      const fillQty = Math.min(takerOrder.remainingQuantity, maker.remainingQuantity);
      const tradePrice = maker.price;

      const buyerOrder = takerOrder.side === OrderSide.BUY ? takerOrder : maker;
      const sellerOrder = takerOrder.side === OrderSide.SELL ? takerOrder : maker;

      const { buyerFee, sellerFee } = await this.executeWalletAndHoldingForFill(
        buyerOrder,
        sellerOrder,
        fillQty,
        tradePrice,
        session
      );

      this.updateOrderForFill(takerOrder, fillQty, tradePrice);
      this.updateOrderForFill(maker, fillQty, tradePrice);

      const buyerOrderReserveRate = buyerOrder.orderType === OrderType.MARKET ? 0.99 : buyerOrder.price;
      const buyerReserved = round(fillQty * buyerOrderReserveRate * (1 + FEE_RATE));
      buyerOrder.lockedAmount = round(Math.max(0, buyerOrder.lockedAmount - buyerReserved));

      if (maker.side === OrderSide.BUY) {
        const makerRate = maker.orderType === OrderType.MARKET ? 0.99 : maker.price;
        maker.lockedAmount = round(Math.max(0, maker.lockedAmount - (fillQty * makerRate * (1 + FEE_RATE))));
      }

      await maker.save({ session });
      if (maker._id.toString() !== takerOrder._id.toString()) await this.syncOrderToRedis(maker);

      const [trade] = await Trade.create(
        [
          {
            marketId: takerOrder.marketId,
            outcome: takerOrder.outcome,
            tradeType: TradeType.ORDER_BOOK,
            buyOrderId: buyerOrder._id,
            sellOrderId: sellerOrder._id,
            buyerId: buyerOrder.userId,
            sellerId: sellerOrder.userId,
            price: tradePrice,
            quantity: fillQty,
            totalValue: round(fillQty * tradePrice),
            fees: {
              platform: round(buyerFee + sellerFee),
              breakdown: { buyerFee, sellerFee, feeRate: FEE_RATE },
            },
            ammSnapshot: null,
            executedAt: new Date(),
          },
        ],
        { session }
      );

      executions.push({
        tradeId: trade._id.toString(),
        quantity: fillQty,
        price: tradePrice,
        buyerOrderId: buyerOrder._id.toString(),
        sellerOrderId: sellerOrder._id.toString(),
      });
    }

    await takerOrder.save({ session });
    await this.syncOrderToRedis(takerOrder);
    return executions;
  }

  async placeOrder(userId: string, dto: PlaceOrderDTO): Promise<{
    orderId: string;
    status: OrderStatus;
    filledQuantity: number;
    remainingQuantity: number;
    executions: MatchExecution[];
    fallbackUsed: boolean;
    fallbackTradeId?: string;
  }> {
    return this.placeOrderWithOptions(userId, dto, {});
  }

  async placeOrderWithOptions(
    userId: string,
    dto: PlaceOrderDTO,
    options: PlaceOrderOptions
  ): Promise<{
    orderId: string;
    status: OrderStatus;
    filledQuantity: number;
    remainingQuantity: number;
    executions: MatchExecution[];
    fallbackUsed: boolean;
    fallbackTradeId?: string;
  }> {
    const marketId = dto.marketId;
    const lockToken = await this.acquireBookLock(marketId, dto.outcome);
    try {
      const result = await withTransaction(async (session) => {
        await this.ensureTradableMarket(marketId, session);
        await riskEngine.preTradeCheck(
          {
            marketId,
            userId,
            route: 'ORDER_BOOK',
            side: dto.side,
            outcome: dto.outcome,
            quantity: dto.quantity,
            price: dto.price,
          },
          session
        );

        if (dto.side === OrderSide.SELL) {
          await this.ensureSellCapacity(userId, marketId, dto.outcome, dto.quantity, session);
        }

        const orderType = dto.orderType ?? OrderType.LIMIT;
        const lockAmount = this.requiredLockAmount(dto.side, orderType, dto.price, dto.quantity);

        const [order] = await Order.create(
          [
            {
              userId: this.toObjectId(userId, 'userId'),
              marketId: this.toObjectId(marketId, 'marketId'),
              outcome: dto.outcome,
              side: dto.side,
              orderType,
              price: dto.price,
              quantity: dto.quantity,
              filledQuantity: 0,
              remainingQuantity: dto.quantity,
              status: OrderStatus.OPEN,
              lockedAmount: lockAmount,
              averageFillPrice: null,
            },
          ],
          { session }
        );

        if (dto.side === OrderSide.BUY && lockAmount > 0) {
          await walletService.lockBalance(
            userId,
            {
              amount: lockAmount,
              referenceId: `ORDER:LOCK:${order._id.toString()}`,
              reason: WalletTxnReason.ORDER_PLACE,
              metadata: { orderId: order._id.toString(), marketId, outcome: dto.outcome },
            },
            session
          );
        }

        await this.syncOrderToRedis(order);
        const executions = await this.matchOrder(session, order);

        return {
          orderId: order._id.toString(),
          status: order.status,
          filledQuantity: order.filledQuantity,
          remainingQuantity: order.remainingQuantity,
          executions,
          fallbackUsed: false,
          orderType: order.orderType,
          side: order.side,
          outcome: order.outcome,
          marketId: order.marketId.toString(),
          lockedAmount: order.lockedAmount,
        };
      });

      if (options.cancelUnfilledRemainder && result.remainingQuantity > 0) {
        await this.cancelOrder(userId, { orderId: result.orderId });
        await this.emitOrderbookUpdate(result.marketId, result.outcome);
        if (result.executions.length > 0) {
          await this.emitExecutionEvents(result.marketId, result.outcome, result.executions);
        }
        return {
          orderId: result.orderId,
          status: result.filledQuantity > 0 ? OrderStatus.PARTIAL : OrderStatus.CANCELLED,
          filledQuantity: result.filledQuantity,
          remainingQuantity: 0,
          executions: result.executions,
          fallbackUsed: false,
        };
      }

      // Hybrid fallback: if market order still has remainder, route it to AMM.
      if (
        !options.disableAmmFallback &&
        result.orderType === OrderType.MARKET &&
        result.remainingQuantity > 0
      ) {
        await this.cancelOrder(userId, { orderId: result.orderId });
        let ammTrade;
        if (result.side === OrderSide.BUY && result.outcome === OrderOutcome.YES) {
          ammTrade = await ammService.buyYes(userId, { marketId: result.marketId, quantity: result.remainingQuantity });
        } else if (result.side === OrderSide.BUY && result.outcome === OrderOutcome.NO) {
          ammTrade = await ammService.buyNo(userId, { marketId: result.marketId, quantity: result.remainingQuantity });
        } else if (result.side === OrderSide.SELL && result.outcome === OrderOutcome.YES) {
          ammTrade = await ammService.sellYes(userId, { marketId: result.marketId, quantity: result.remainingQuantity });
        } else {
          ammTrade = await ammService.sellNo(userId, { marketId: result.marketId, quantity: result.remainingQuantity });
        }

        return {
          orderId: result.orderId,
          status: OrderStatus.FILLED,
          filledQuantity: round(result.filledQuantity + result.remainingQuantity),
          remainingQuantity: 0,
          executions: result.executions,
          fallbackUsed: true,
          fallbackTradeId: ammTrade.tradeId,
        };
      }

      if (result.executions.length > 0) {
        await withTransaction(async (session) => {
          await riskEngine.postTradeUpdate(result.marketId, session);
        });
        await riskEngine.syncRiskSnapshotToRedis(result.marketId);
      }

      await this.emitOrderbookUpdate(result.marketId, result.outcome);
      if (result.executions.length > 0) {
        await this.emitExecutionEvents(result.marketId, result.outcome, result.executions);
      }

      return {
        orderId: result.orderId,
        status: result.status,
        filledQuantity: result.filledQuantity,
        remainingQuantity: result.remainingQuantity,
        executions: result.executions,
        fallbackUsed: false,
      };
    } finally {
      await this.releaseBookLock(marketId, dto.outcome, lockToken);
    }
  }

  async getBestPrice(
    marketId: string,
    outcome: OrderOutcome,
    takerSide: OrderSide
  ): Promise<number | null> {
    const oppositeSide = takerSide === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const row = await Order.findOne({
      marketId: this.toObjectId(marketId, 'marketId'),
      outcome,
      side: oppositeSide,
      status: { $in: [OrderStatus.OPEN, OrderStatus.PARTIAL] },
    })
      .sort(this.sideSort(oppositeSide))
      .select('price')
      .lean();
    return row?.price ?? null;
  }

  async getExecutableLiquidity(
    marketId: string,
    outcome: OrderOutcome,
    takerSide: OrderSide,
    limitPrice?: number
  ): Promise<number> {
    const oppositeSide = takerSide === OrderSide.BUY ? OrderSide.SELL : OrderSide.BUY;
    const condition: Record<string, unknown> = {
      marketId: this.toObjectId(marketId, 'marketId'),
      outcome,
      side: oppositeSide,
      status: { $in: [OrderStatus.OPEN, OrderStatus.PARTIAL] },
    };
    if (typeof limitPrice === 'number') {
      condition.price = takerSide === OrderSide.BUY ? { $lte: limitPrice } : { $gte: limitPrice };
    }

    const [agg] = await Order.aggregate<{ qty: number }>([
      { $match: condition },
      { $group: { _id: null, qty: { $sum: '$remainingQuantity' } } },
    ]);

    return round(agg?.qty ?? 0);
  }

  async cancelOrder(userId: string, dto: CancelOrderDTO): Promise<{ orderId: string; status: OrderStatus }> {
    const result = await withTransaction(async (session) => {
      const order = await Order.findOne({
        _id: this.toObjectId(dto.orderId, 'orderId'),
        userId: this.toObjectId(userId, 'userId'),
      }).session(session);
      if (!order) throw new AppError('Order not found.', 404);
      if (![OrderStatus.OPEN, OrderStatus.PARTIAL].includes(order.status)) {
        throw new AppError('Only OPEN/PARTIAL orders can be cancelled.', 409);
      }

      if (order.side === OrderSide.BUY && order.lockedAmount > 0) {
        await walletService.unlockBalance(
          userId,
          {
            amount: order.lockedAmount,
            referenceId: `ORDER:CANCEL:${order._id.toString()}`,
            reason: WalletTxnReason.ORDER_CANCEL,
            metadata: { orderId: order._id.toString() },
          },
          session
        );
      }

      order.status = OrderStatus.CANCELLED;
      order.remainingQuantity = 0;
      order.lockedAmount = 0;
      await order.save({ session });
      await this.syncOrderToRedis(order);
      return { orderId: order._id.toString(), status: order.status, marketId: order.marketId.toString(), outcome: order.outcome };
    });
    await this.emitOrderbookUpdate(result.marketId, result.outcome);
    return { orderId: result.orderId, status: result.status };
  }

  async getOrderBook(marketId: string, outcome: OrderOutcome, depth = 20): Promise<{
    buys: Array<{ price: number; quantity: number }>;
    sells: Array<{ price: number; quantity: number }>;
  }> {
    const marketObjectId = this.toObjectId(marketId, 'marketId');
    const [buyRows, sellRows] = await Promise.all([
      Order.aggregate<{ _id: number; quantity: number }>([
        {
          $match: {
            marketId: marketObjectId,
            outcome,
            side: OrderSide.BUY,
            status: { $in: [OrderStatus.OPEN, OrderStatus.PARTIAL] },
          },
        },
        { $group: { _id: '$price', quantity: { $sum: '$remainingQuantity' } } },
        { $sort: { _id: -1 } },
        { $limit: depth },
      ]),
      Order.aggregate<{ _id: number; quantity: number }>([
        {
          $match: {
            marketId: marketObjectId,
            outcome,
            side: OrderSide.SELL,
            status: { $in: [OrderStatus.OPEN, OrderStatus.PARTIAL] },
          },
        },
        { $group: { _id: '$price', quantity: { $sum: '$remainingQuantity' } } },
        { $sort: { _id: 1 } },
        { $limit: depth },
      ]),
    ]);

    return {
      buys: buyRows.map((r) => ({ price: r._id, quantity: round(r.quantity) })),
      sells: sellRows.map((r) => ({ price: r._id, quantity: round(r.quantity) })),
    };
  }

  async getUserOrders(
    userId: string,
    query: { marketId?: string; status?: string; page?: number; limit?: number }
  ): Promise<{ orders: IOrder[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.max(1, Math.min(100, Number(query.limit ?? 20)));
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { userId: this.toObjectId(userId, 'userId') };
    if (query.marketId) filter.marketId = this.toObjectId(query.marketId, 'marketId');
    if (query.status) filter.status = query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Order.countDocuments(filter),
    ]);
    return {
      orders,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export default new OrderbookService();
