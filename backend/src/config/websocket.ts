import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { Server as HttpServer } from 'http';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import config from './env';
import { createBullMQConnection } from './redis.config';
import { JwtPayload } from '../mdules/user/users.types';

// ═════════════════════════════════════════════════════════════════════════════
// CHANNEL HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns the Redis pub/sub channel name for a given matchId.
 * score.service.ts publishes to this; the subscriber here fans-out to WS clients.
 */
export const matchChannel = (matchId: string): string => `match:${matchId}`;

// ═════════════════════════════════════════════════════════════════════════════
// ATTACH WEBSOCKET SERVER
// ═════════════════════════════════════════════════════════════════════════════
//
// Architecture:
//   • One shared WebSocket server attached to the HTTP server on the same port.
//   • Clients connect via:  ws://host/ws/match?matchId=<id>&token=<jwt>
//   • Each client's matchId maps to a Redis sub channel — "match:<matchId>".
//   • A SINGLE Redis subscriber connection is created ONCE at startup and
//     shared across all clients. When new matchIds appear, the subscriber
//     subscribes to that channel. When the last client watching a match
//     disconnects, we unsubscribe from that channel.
//   • The subscriber maps channel → Set<WebSocket> to fan-out efficiently.

export const attachWebSocketServer = (httpServer: HttpServer): void => {

  const wss = new WebSocketServer({ server: httpServer, path: '/ws/match' });

  // One dedicated ioredis connection for subscribing
  const subscriber = createBullMQConnection();

  // Map: channel name → set of WebSocket clients watching that channel
  const channelClients = new Map<string, Set<WebSocket>>();

  // ── Fan-out incoming Redis messages to WS clients ─────────────────────────
  subscriber.on('message', (channel: string, message: string) => {
    const clients = channelClients.get(channel);
    if (!clients || clients.size === 0) return;

    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  });

  subscriber.on('error', (err: Error) => {
    console.error(`🔴 WS Redis subscriber error: ${err.message}`);
  });

  // ── Handle new WebSocket connections ─────────────────────────────────────
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {

    // ── 1. Parse query params ────────────────────────────────────────────
    const reqUrl  = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const matchId = reqUrl.searchParams.get('matchId');
    const token   = reqUrl.searchParams.get('token');

    // ── 2. Validate matchId ──────────────────────────────────────────────
    if (!matchId) {
      ws.close(1008, 'matchId query parameter is required');
      return;
    }

    // ── 3. Authenticate via JWT ──────────────────────────────────────────
    if (!token) {
      ws.close(1008, 'token query parameter is required');
      return;
    }

    try {
      jwt.verify(token, config.jwtSecret) as JwtPayload;
    } catch {
      ws.close(1008, 'Invalid or expired token');
      return;
    }

    // ── 4. Subscribe this client to the match channel ────────────────────
    const channel = matchChannel(matchId);

    if (!channelClients.has(channel)) {
      channelClients.set(channel, new Set());
      // Subscribe to Redis channel when first client joins
      subscriber.subscribe(channel, (err) => {
        if (err) console.error(`🔴 Redis subscribe error for ${channel}: ${err.message}`);
        else     console.log(`🟢 Redis subscribed to ${channel}`);
      });
    }

    channelClients.get(channel)!.add(ws);
    console.log(`🟢 WS client connected — matchId: ${matchId} | clients on channel: ${channelClients.get(channel)!.size}`);

    // Send acknowledgement to the connected client
    ws.send(JSON.stringify({
      type:    'CONNECTED',
      matchId,
      message: 'Successfully joined live match feed.',
    }));

    // ── 5. Handle client disconnect ──────────────────────────────────────
    ws.on('close', () => {
      const clients = channelClients.get(channel);
      if (clients) {
        clients.delete(ws);
        console.log(`🟡 WS client disconnected — matchId: ${matchId} | remaining: ${clients.size}`);

        // Unsubscribe from Redis when no clients are watching this match
        if (clients.size === 0) {
          channelClients.delete(channel);
          subscriber.unsubscribe(channel, (err) => {
            if (err) console.error(`🔴 Redis unsubscribe error for ${channel}: ${err.message}`);
            else     console.log(`🟡 Redis unsubscribed from ${channel} — no clients remaining`);
          });
        }
      }
    });

    // ── 6. Handle errors silently (don't crash server) ───────────────────
    ws.on('error', (err: Error) => {
      console.error(`🔴 WS client error: ${err.message}`);
    });

  });

  console.log('🟢 WebSocket server attached — endpoint: /ws/match?matchId=<id>&token=<jwt>');
};
