import type { Context, NextFunction } from "grammy";
import { createChildLogger } from "../../utils/logger.js";

const log = createChildLogger("rate-limit");

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export function createRateLimitMiddleware(
  maxRequests: number,
  windowMs: number,
) {
  const buckets = new Map<number, TokenBucket>();

  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const now = Date.now();
    let bucket = buckets.get(userId);

    if (!bucket) {
      bucket = { tokens: maxRequests, lastRefill: now };
      buckets.set(userId, bucket);
    }

    // Refill tokens
    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor((elapsed / windowMs) * maxRequests);
    if (refill > 0) {
      bucket.tokens = Math.min(maxRequests, bucket.tokens + refill);
      bucket.lastRefill = now;
    }

    if (bucket.tokens <= 0) {
      log.warn({ userId }, "Rate limited");
      await ctx.reply("You're sending messages too fast. Please slow down.");
      return;
    }

    bucket.tokens--;
    return next();
  };
}
