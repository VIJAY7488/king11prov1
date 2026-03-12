import Redis, { RedisOptions } from 'ioredis';
import config from './env';

// ── Connection Options ───────────────────────────────────────────────────────
// These options are shared by both the general-purpose client and the
// dedicated BullMQ connection factory so behaviour is consistent everywhere.
export const baseRedisOptions: RedisOptions = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword || undefined, // omit key when empty
  db: config.redisDb,

  // TLS — automatically enabled for rediss:// URIs or when forced via env
  tls: config.redisTls ? {} : undefined,

  // ── Reconnect strategy ─────────────────────────────────────────
  // Called after every failed attempt; return delay in ms or null to stop.
  retryStrategy(times: number): number | null {
    if (times > 10) {
      console.error('🔴 Redis: exceeded 10 reconnect attempts — giving up.');
      return null; // stop retrying; 'error' event will fire
    }
    const delay = Math.min(50 * 2 ** times, 30_000); // exp back-off, cap 30 s
    console.warn(`🟡 Redis: reconnect attempt #${times} — retrying in ${delay}ms`);
    return delay;
  },

  // ── Timeouts & reliability ─────────────────────────────────────
  connectTimeout: 10_000,          // TCP connect timeout
  commandTimeout: 5_000,           // Per-command timeout
  keepAlive: 10_000,               // TCP keep-alive interval
  enableReadyCheck: true,          // Wait for Redis LOADING to finish
  maxRetriesPerRequest: 3,         // Per-command retry budget (null = unlimited)
  enableOfflineQueue: true,        // Buffer commands while reconnecting
  lazyConnect: true,               // Don't auto-connect on instantiation
};

// ── General-Purpose Client ───────────────────────────────────────────────────
// Use this for caching, pub/sub, session storage, rate-limiting, etc.
const redisClient = new Redis(baseRedisOptions);

// ── Event Listeners ──────────────────────────────────────────────────────────
redisClient.on('connect', () => console.log('🟢 Redis connecting...'));
redisClient.on('ready', () => console.log('🟢 Redis ready'));
redisClient.on('reconnecting', () => console.warn('🔄 Redis reconnecting...'));
redisClient.on('close', () => console.warn('🟡 Redis connection closed'));
redisClient.on('end', () => console.warn('🟡 Redis connection ended — no more retries'));
redisClient.on('error', (err: Error) => {
  // ioredis emits ECONNREFUSED etc. — log but don't crash; retryStrategy decides fate
  console.error(`🔴 Redis error: ${err.message}`);
});

// ── Connect ──────────────────────────────────────────────────────────────────
export const connectRedis = async (): Promise<void> => {
  if (!config.redisHost) {
    throw new Error('REDIS_HOST is not defined in environment variables.');
  }

  try {
    // lazyConnect: true means we must call .connect() explicitly
    await redisClient.connect();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`🔴 Redis initial connection failed: ${message}`);
    process.exit(1); // Fatal — treat Redis as a required service
  }
};

// ── Disconnect ───────────────────────────────────────────────────────────────
export const disconnectRedis = async (): Promise<void> => {
  try {
    await redisClient.quit(); // sends QUIT, waits for ACK, then closes socket
    console.log('✅ Redis connection closed gracefully.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`🔴 Error closing Redis connection: ${message}`);
    redisClient.disconnect(); // force-close if QUIT fails
  }
};

// ── BullMQ Connection Factory ────────────────────────────────────────────────
// BullMQ requires its own dedicated ioredis instance per Queue/Worker/Scheduler
// (it must not share a connection used for blocking commands like BLPOP).
// Call this factory whenever you create a new Queue or Worker.
//
// Usage:
//   import { createBullMQConnection } from '../config/redis';
//   const queue = new Queue('emails', { connection: createBullMQConnection() });
//   const worker = new Worker('emails', processor, { connection: createBullMQConnection() });
//
export const createBullMQConnection = (): Redis => {
  const conn = new Redis({
    ...baseRedisOptions,
    // BullMQ uses blocking commands; disable the per-command timeout for workers
    // so long-running jobs don't get killed by the socket timeout.
    commandTimeout: undefined,
    // BullMQ manages its own retry logic internally — align with its expectations
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  conn.on('error', (err: Error) =>
    console.error(`🔴 BullMQ Redis error: ${err.message}`)
  );

  return conn;
};

export default redisClient;