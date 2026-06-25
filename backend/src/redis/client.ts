import Redis from 'ioredis';
import { config } from '../config';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  console.error('[redis error]', err);
});

redis.on('connect', () => {
  console.log('[redis] conectado');
});
