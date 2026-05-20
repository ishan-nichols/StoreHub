import type { Request, Response, NextFunction } from "express";
import { getRedis } from "../lib/redis.js";

// In-memory fallback when Redis is unavailable
const memStore = new Map<string, { count: number; resetAt: number }>();

function memCheck(key: string, max: number, windowMs: number): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = memStore.get(key);
  if (!entry || now > entry.resetAt) {
    memStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }
  entry.count++;
  const allowed = entry.count <= max;
  return { allowed, remaining: Math.max(0, max - entry.count), resetAt: entry.resetAt };
}

async function redisCheck(
  key: string,
  max: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedis();
  const now = Date.now();
  const windowKey = `rl:${key}:${Math.floor(now / windowMs)}`;

  const [[, count]] = await redis
    .pipeline()
    .incr(windowKey)
    .expire(windowKey, Math.ceil(windowMs / 1000) + 1)
    .exec() as [[null, number]];

  const resetAt = (Math.floor(now / windowMs) + 1) * windowMs;
  return {
    allowed:   count <= max,
    remaining: Math.max(0, max - count),
    resetAt,
  };
}

interface RateLimitOptions {
  max: number;
  windowMs: number;
  // Function to derive the rate-limit key from the request
  keyFn?: (req: Request) => string;
  message?: string;
}

export function rateLimit(opts: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip  = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress
      ?? "unknown";

    const key = opts.keyFn ? opts.keyFn(req) : ip;

    try {
      const redis = getRedis();
      // Quick ping to check if Redis is reachable
      const status = redis.status;
      let result: { allowed: boolean; remaining: number; resetAt: number };

      if (status === "ready" || status === "connect") {
        result = await redisCheck(key, opts.max, opts.windowMs);
      } else {
        result = memCheck(key, opts.max, opts.windowMs);
      }

      res.setHeader("X-RateLimit-Limit",     opts.max);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset",     Math.ceil(result.resetAt / 1000));

      if (!result.allowed) {
        res.setHeader("Retry-After", Math.ceil((result.resetAt - Date.now()) / 1000));
        res.status(429).json({ error: opts.message ?? "Too many requests — please try again later" });
        return;
      }
    } catch {
      // Redis error — fail open (allow request) to avoid blocking legitimate traffic
    }

    next();
  };
}

// ─── Pre-built limiters ───────────────────────────────────────────────────────

// Strict: auth endpoints (login, signup, password reset)
export const authLimiter = rateLimit({
  max:      50,
  windowMs: 15 * 60 * 1000,
  keyFn:    (req) => {
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress ?? "unknown";
    return `auth:${ip}`;
  },
  message: "Too many authentication attempts — please wait 15 minutes",
});

// Very strict: password reset by email address
export const passwordResetLimiter = rateLimit({
  max:      3,
  windowMs: 60 * 60 * 1000,
  keyFn:    (req) => `pwreset:${(req.body?.email ?? "").toLowerCase()}`,
  message:  "Too many password reset requests — please wait 1 hour",
});

// Portal PIN attempts per store
export const portalPinLimiter = rateLimit({
  max:      10,
  windowMs: 5 * 60 * 1000,
  keyFn:    (req) => `pin:${req.params.storeUserId}`,
  message:  "Too many PIN attempts — please wait 5 minutes",
});

// General API: per authenticated user
export const apiLimiter = rateLimit({
  max:      300,
  windowMs: 60 * 1000,
  keyFn:    (req) => `api:${req.userId ?? req.socket.remoteAddress ?? "anon"}`,
});
