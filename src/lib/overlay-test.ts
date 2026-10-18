import { randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";

/**
 * "Test on OBS": a sample alert the creator fires from the dashboard. It lives
 * in Redis for TEST_TTL_MS keyed by creator — never in Postgres, so it can't
 * mix with real tips. Reads don't consume it: a creator running the old alert
 * link and the single link at once sees it on both (each overlay shows a
 * given id once). Without Upstash env (local dev / tests) an in-process map
 * stands in, like src/lib/ratelimit.ts.
 */

export const TEST_TTL_MS = 15_000;
export const TEST_NAME = "ผู้สนับสนุนตัวอย่าง";
export const TEST_MESSAGE = "ทดสอบแจ้งเตือน";

export type TestAlert = { id: string; amount: number; name: string; message: string };

const hasUpstash = Boolean(
  (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN),
);
const redis = hasUpstash ? Redis.fromEnv() : null;
// On globalThis: Next bundles each route separately, so a module-level map
// would give the test route and the overlay routes different copies.
const g = globalThis as unknown as {
  __tiptangTestAlerts?: Map<string, { value: TestAlert; expiresAt: number }>;
};
const memory = (g.__tiptangTestAlerts ??= new Map());

const keyFor = (userId: string) => `tiptang/test/${userId}`;

export async function pushTestAlert(
  userId: string,
  amount: number,
  now: number = Date.now(),
): Promise<TestAlert> {
  const value: TestAlert = { id: `test_${randomUUID()}`, amount, name: TEST_NAME, message: TEST_MESSAGE };
  if (redis) {
    await redis.set(keyFor(userId), value, { px: TEST_TTL_MS });
  } else {
    memory.set(keyFor(userId), { value, expiresAt: now + TEST_TTL_MS });
  }
  return value;
}

export async function readTestAlert(
  userId: string,
  now: number = Date.now(),
): Promise<TestAlert | null> {
  if (redis) {
    try {
      return (await redis.get<TestAlert>(keyFor(userId))) ?? null;
    } catch {
      return null; // a Redis hiccup must never break the alert feed
    }
  }
  const hit = memory.get(keyFor(userId));
  if (!hit) return null;
  if (hit.expiresAt <= now) {
    memory.delete(keyFor(userId));
    return null;
  }
  return hit.value;
}
