import rateLimit, { Store, MemoryStore } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../services/redis.service';
import { logger } from '../utils/logger';

class FallbackStore implements Store {
  private redisStore: RedisStore;
  private memoryStore: MemoryStore;

  constructor() {
    this.redisStore = new RedisStore({
      sendCommand: (...args: string[]) => {
        if (redisClient.status !== 'ready') {
          return Promise.reject(new Error('Redis is not ready'));
        }
        return redisClient.call(args[0], ...args.slice(1)) as Promise<any>;
      },
    });
    this.memoryStore = new MemoryStore();
  }

  init(options: any) {
    if (this.isRedisReady && this.redisStore.init) {
      Promise.resolve(this.redisStore.init(options)).catch(() => {
        logger.warn('Redis rate-limit store initialization failed. Operating with memory fallback.');
      });
    }
    this.memoryStore.init(options);
  }

  private get isRedisReady(): boolean {
    return redisClient.status === 'ready';
  }

  async get(key: string) {
    if (this.isRedisReady) {
      try {
        return await this.redisStore.get?.(key);
      } catch {
        // Fall through
      }
    }
    return this.memoryStore.get(key);
  }

  async increment(key: string) {
    if (this.isRedisReady) {
      try {
        return await this.redisStore.increment(key);
      } catch {
        // Fall through
      }
    }
    return this.memoryStore.increment(key);
  }

  async decrement(key: string) {
    if (this.isRedisReady) {
      try {
        return await this.redisStore.decrement(key);
      } catch {
        // Fall through
      }
    }
    return this.memoryStore.decrement(key);
  }

  async resetKey(key: string) {
    if (this.isRedisReady) {
      try {
        return await this.redisStore.resetKey(key);
      } catch {
        // Fall through
      }
    }
    return this.memoryStore.resetKey(key);
  }

  async resetAll() {
    if (this.isRedisReady) {
      try {
        return await (this.redisStore as any).resetAll?.();
      } catch {
        // Fall through
      }
    }
    return this.memoryStore.resetAll();
  }

  async shutdown() {
    if ((this.redisStore as any).shutdown) await (this.redisStore as any).shutdown();
    this.memoryStore.shutdown();
  }
}

const createLimiter = (windowMs: number, max: number, message: string) => {
  const isDevOrTest = process.env.NODE_ENV === 'test' || process.env.NODE_ENV !== 'production';
  const finalMax = isDevOrTest ? 10000 : max;

  return rateLimit({
    windowMs,
    max: finalMax,
    message: { success: false, error: message, code: 'RATE_LIMIT_EXCEEDED' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Never rate-limit in development or local test environments
      if (process.env.NODE_ENV !== 'production') return true;
      // Always allow payment status polling and health checks
      if (req.path?.includes('/status') || req.path?.includes('/health')) return true;
      return false;
    },
    store: new FallbackStore(),
  });
};

// General API limit: 1000 req per 15 minutes in production
export const generalLimiter = createLimiter(
  15 * 60 * 1000,
  1000,
  'Too many requests. Please try again in 15 minutes.'
);

// Auth routes (/login, /refresh, /register): 15 attempts per 15 minutes
export const authLimiter = createLimiter(
  15 * 60 * 1000,
  15,
  'Too many authentication attempts. Please wait 15 minutes before trying again.'
);

// Password reset: 3 attempts per hour
export const passwordResetLimiter = createLimiter(
  60 * 60 * 1000,
  3,
  'Too many password reset requests. Please wait 1 hour.'
);

// AI routes: 10 req per minute
export const aiLimiter = createLimiter(
  60 * 1000,
  10,
  'Too many AI requests. Please slow down.'
);
