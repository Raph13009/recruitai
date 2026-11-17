// Small in-memory fixed-window limiter. Per server instance: enough to blunt abuse of the
// endpoints that spend credits in the MVP, not a replacement for an edge or Redis limiter.

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __recruitaiRateLimit?: Map<string, Bucket> };
const buckets = (g.__recruitaiRateLimit ??= new Map());

/** True when the call is allowed, false when `key` already used its `limit` in the current window. */
export function rateLimit(key: string, limit: number, windowMs: number, nowMs: number = Date.now()): boolean {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= nowMs) {
    if (buckets.size > 5000) for (const [k, b] of buckets) if (b.resetAt <= nowMs) buckets.delete(k);
    buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** Best-effort caller address, for limiter keys only. */
export function clientAddress(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
