import redisClient, { createBullMQConnection } from './redis.config';

export const MARKET_EVENTS_CHANNEL = 'realtime:market-events';

export interface RealtimeMarketEvent<T = Record<string, unknown>> {
  marketId: string;
  event: 'price_update' | 'orderbook_update' | 'trade_executed' | 'market_status_update';
  payload: T;
  ts: string;
}

export const publishMarketEvent = async <T = Record<string, unknown>>(
  marketId: string,
  event: RealtimeMarketEvent<T>['event'],
  payload: T
): Promise<void> => {
  const envelope: RealtimeMarketEvent<T> = {
    marketId,
    event,
    payload,
    ts: new Date().toISOString(),
  };
  await redisClient.publish(MARKET_EVENTS_CHANNEL, JSON.stringify(envelope));
};

export const createMarketEventSubscriber = () => {
  const sub = createBullMQConnection();
  return {
    subscribe: async (handler: (event: RealtimeMarketEvent) => void): Promise<void> => {
      sub.on('message', (_channel: string, message: string) => {
        try {
          const parsed = JSON.parse(message) as RealtimeMarketEvent;
          handler(parsed);
        } catch (err) {
          console.error('🔴 Failed to parse realtime market event:', err);
        }
      });

      await sub.subscribe(MARKET_EVENTS_CHANNEL);
    },
    close: async (): Promise<void> => {
      try {
        await sub.quit();
      } catch {
        sub.disconnect();
      }
    },
  };
};
