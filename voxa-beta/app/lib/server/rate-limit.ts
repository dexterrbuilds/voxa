// Minimal in-memory fixed-window rate limiter.
//
// Process-local only (no shared store), which is enough for the sandbox message
// endpoint on a single long-running Node host. It is NOT a distributed limiter;
// if Voxa later runs multiple instances, swap this for a shared store. Keyed by
// an arbitrary string (we use the authenticated user id).

type WindowState = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, WindowState>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}
