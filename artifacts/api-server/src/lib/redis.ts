import Redis from "ioredis";
import { logger } from "./logger.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    _redis.on("error", (err: Error) => {
      logger.warn({ err }, "Redis connection error — rate limiting may be degraded");
    });
    _redis.on("connect", () => logger.info("Redis connected"));
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

export { Redis };
