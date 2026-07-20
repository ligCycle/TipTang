import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Uses Upstash Redis (shared across serverless instances) when configured.
// Falls back to a per-process in-memory limiter for local dev / when Upstash
// isn't set up — good enough locally, but not effective across Vercel instances.

const hasUpstash = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);
const redis = hasUpstash ? Redis.fromEnv() : null;
const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, windowMs: number): Ratelimit {
  const key = `${limit}:${windowMs}`;
  let rl = limiters.get(key);
  if (!rl) {
    rl = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs} ms`),
      prefix: "tiptang/rl",
    });
    limiters.set(key, rl);
  }
  return rl;
}

// --- in-memory fallback ---
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
function memoryLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true, retryAfter: 0 };
}

export async function rateLimit(
  key: string,
  limit = 5,
  windowMs = 60_000,
): Promise<{ ok: boolean; retryAfter: number }> {
  if (redis) {
    const res = await getLimiter(limit, windowMs).limit(key);
    return {
      ok: res.success,
      retryAfter: Math.max(0, Math.ceil((res.reset - Date.now()) / 1000)),
    };
  }
  return memoryLimit(key, limit, windowMs);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
