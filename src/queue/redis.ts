import { Redis } from 'ioredis';
import { config } from '../config.js';

export function createRedis(): Redis {
  // BullMQ requires maxRetriesPerRequest: null on worker connections
  return new Redis(config.REDIS_DATABASE_URL, { maxRetriesPerRequest: null });
}
