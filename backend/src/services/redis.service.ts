import Redis from 'ioredis';
import { logger } from '../utils/logger';

let isLoggedFallback = false;

export const redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    if (times > 3) {
      if (!isLoggedFallback) {
        isLoggedFallback = true;
        logger.info('ℹ️ Redis server unavailable — using built-in in-memory cache.');
      }
      return null; // Stop reconnection loop when Redis is not running
    }
    return 500;
  },
});

redisClient.on('connect', () => {
  isLoggedFallback = false;
  logger.info('Redis: connected');
});

redisClient.on('error', (err: any) => {
  if (err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED') || err?.name === 'AggregateError') {
    if (!isLoggedFallback) {
      isLoggedFallback = true;
      logger.info('ℹ️ Redis is not running locally. App is running seamlessly with in-memory fallback.');
    }
    return;
  }
  logger.error('Redis error:', err);
});

redisClient.on('reconnecting', () => {
  if (!isLoggedFallback) {
    logger.warn('Redis: attempting connection...');
  }
});

export function isRedisReady(): boolean {
  return redisClient.status === 'ready';
}

export async function connectRedis(): Promise<Redis> {
  if (redisClient.status === 'ready') {
    return redisClient;
  }

  try {
    if (redisClient.status === 'wait') {
      redisClient.connect().catch(() => {});
    }

    await new Promise<void>((resolve, reject) => {
      if (redisClient.status === 'ready') {
        return resolve();
      }

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onClose = () => {
        cleanup();
        reject(new Error('Redis connection closed'));
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        redisClient.off('ready', onReady);
        redisClient.off('close', onClose);
        redisClient.off('error', onError);
      };

      redisClient.on('ready', onReady);
      redisClient.on('close', onClose);
      redisClient.on('error', onError);
    });
  } catch (error) {
    logger.warn('⚠️ Redis connection failed. Falling back to in-memory store/cache.');
  }
  return redisClient;
}

// In-memory cache fallback for development/fallback mode
const memoryCache = new Map<string, { value: string; expiry: number }>();

// Cache helpers
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (isRedisReady()) {
    try {
      const data = await redisClient.get(key);
      return data ? (JSON.parse(data) as T) : null;
    } catch (err) {
      logger.error('Redis cacheGet error, falling back to memory cache:', err);
    }
  }

  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiry) {
    memoryCache.delete(key);
    return null;
  }
  return JSON.parse(item.value) as T;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  const stringified = JSON.stringify(value);
  if (isRedisReady()) {
    try {
      await redisClient.setex(key, ttlSeconds, stringified);
      return;
    } catch (err) {
      logger.error('Redis cacheSet error, falling back to memory cache:', err);
    }
  }

  memoryCache.set(key, {
    value: stringified,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

export async function cacheDel(key: string): Promise<void> {
  if (isRedisReady()) {
    try {
      await redisClient.del(key);
      return;
    } catch (err) {
      logger.error('Redis cacheDel error, falling back to memory cache:', err);
    }
  }
  memoryCache.delete(key);
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  if (isRedisReady()) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      return;
    } catch (err) {
      logger.error('Redis cacheDelPattern error, falling back to memory cache:', err);
    }
  }

  // Convert redis pattern (like 'session:*') to basic regex
  const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  for (const key of memoryCache.keys()) {
    if (regexPattern.test(key)) {
      memoryCache.delete(key);
    }
  }
}

// Session management
export async function setSession(
  sessionId: string,
  data: Record<string, unknown>,
  ttlSeconds = 7 * 24 * 60 * 60
): Promise<void> {
  await cacheSet(`session:${sessionId}`, data, ttlSeconds);
}

export async function getSession(sessionId: string): Promise<Record<string, unknown> | null> {
  return cacheGet<Record<string, unknown>>(`session:${sessionId}`);
}

export async function deleteSession(sessionId: string): Promise<void> {
  await cacheDel(`session:${sessionId}`);
}

// Blacklist JWT (for logout)
export async function blacklistToken(jti: string, ttlSeconds: number): Promise<void> {
  if (isRedisReady()) {
    try {
      await redisClient.setex(`blacklist:${jti}`, ttlSeconds, '1');
      return;
    } catch (err) {
      logger.error('Redis blacklistToken error, falling back to memory cache:', err);
    }
  }
  
  memoryCache.set(`blacklist:${jti}`, {
    value: '1',
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  if (isRedisReady()) {
    try {
      const result = await redisClient.get(`blacklist:${jti}`);
      return result !== null;
    } catch (err) {
      logger.error('Redis isTokenBlacklisted error, falling back to memory cache:', err);
    }
  }

  const item = memoryCache.get(`blacklist:${jti}`);
  if (!item) return false;
  if (Date.now() > item.expiry) {
    memoryCache.delete(`blacklist:${jti}`);
    return false;
  }
  return true;
}
