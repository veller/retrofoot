import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../index';

type RateLimitOptions = {
  keyPrefix: string;
  maxRequests: number;
  windowMs: number;
  methods?: string[];
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitEntry>();

function getClientIdentifier(c: Context<{ Bindings: Env }>): string {
  const ip =
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    c.req.header('X-Real-IP');
  if (ip) {
    return ip;
  }
  const userAgent = c.req.header('User-Agent') ?? 'unknown-agent';
  return `ua:${userAgent.slice(0, 64)}`;
}

function shouldSkipMethod(methods: string[] | undefined, method: string): boolean {
  if (!methods || methods.length === 0) {
    return false;
  }
  return !methods.includes(method.toUpperCase());
}

function cleanExpiredBuckets(now: number): void {
  for (const [key, entry] of buckets.entries()) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function createRateLimitMiddleware(
  options: RateLimitOptions,
): MiddlewareHandler<{ Bindings: Env }> {
  return async function rateLimitMiddleware(c, next) {
    const method = c.req.method.toUpperCase();
    if (shouldSkipMethod(options.methods, method)) {
      await next();
      return;
    }

    const now = Date.now();
    if (buckets.size > 2000) {
      cleanExpiredBuckets(now);
    }

    const key = `${options.keyPrefix}:${method}:${getClientIdentifier(c)}`;
    const entry = buckets.get(key);

    if (!entry || entry.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      await next();
      return;
    }

    if (entry.count >= options.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((entry.resetAt - now) / 1000),
      );
      c.header('Retry-After', String(retryAfterSeconds));
      return c.json(
        {
          error: 'Too many requests',
          retryAfterSeconds,
        },
        429,
      );
    }

    entry.count += 1;
    buckets.set(key, entry);
    await next();
  };
}
