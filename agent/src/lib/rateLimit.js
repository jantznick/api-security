/**
 * Simple fixed-window rate limiter (per key / IP).
 * Fail-open on internal errors; caller decides what to do when limited.
 */

export function createRateLimiter({ windowMs = 60_000, maxRequests = 120 } = {}) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map();

  function allow(key) {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count <= maxRequests;
  }

  /** Occasional cleanup to avoid unbounded map growth */
  function sweep() {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  setInterval(sweep, Math.max(windowMs, 30_000)).unref?.();

  return { allow, sweep };
}
