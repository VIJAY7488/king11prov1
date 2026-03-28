import { createServer } from 'http';
import createApp from './app';
import config from './config/env';
import { connectDB, disconnectDB } from './config/db.config';
import { connectRedis, disconnectRedis } from './config/redis.config';
import { attachWebSocketServer } from './config/websocket';


const bootstrap = async (): Promise<void> => {
  // 1. Establish infrastructure connections before accepting traffic
  await Promise.all([
    connectDB(),
    connectRedis(),
  ]);

  // 2. Create the Express app
  const app = createApp();

  // 3. Wrap in a raw HTTP server so WebSocket can share the same port
  const httpServer = createServer(app);

  // 4. Attach WebSocket server — registers /ws/match?matchId=<id>&token=<jwt> endpoint
  attachWebSocketServer(httpServer);

  // 5. Start listening
  httpServer.listen(config.port, () => {
    console.log(`✅ Server running on http://localhost:${config.port}`);
    console.log(`📋 Health check: http://localhost:${config.port}/api/v1/health`);
    console.log(`🔌 Socket.io:    ws://localhost:${config.port}/socket.io (JWT auth + market rooms)`);
  });

  // ── Graceful Shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n⚠️  ${signal} received — shutting down gracefully...`);

    httpServer.close(async () => {
      console.log('✅ HTTP + WS server closed.');
      await Promise.all([disconnectDB(), disconnectRedis()]);
      process.exit(0);
    });

    setTimeout(() => {
      console.error('❌ Forced exit after timeout.');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason: unknown) => {
    console.error('❌ Unhandled Rejection:', reason);
    httpServer.close(() => process.exit(1));
  });

  process.on('uncaughtException', (error: Error) => {
    console.error('❌ Uncaught Exception:', error.message);
    process.exit(1);
  });
};

bootstrap();
