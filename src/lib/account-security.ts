import "server-only";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/*
 * Session revocation. Sessions are JWTs (no DB row to delete), so each token
 * carries the user's `sessionVersion` from sign-in time and the jwt callback
 * compares it with the current value. Bumping the column signs out every
 * device. Lookups are cached per server instance for a short while so a busy
 * dashboard doesn't hit the DB on every request; a bump made on another
 * instance therefore takes up to CACHE_MS to reach this one.
 */

const CACHE_MS = 30_000;
const cache = new Map<string, { version: number | null; at: number }>();

/** Current version, or null when the user no longer exists. */
export async function currentSessionVersion(
  userId: string,
): Promise<number | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.version;
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  const version = row ? row.sessionVersion : null;
  cache.set(userId, { version, at: Date.now() });
  if (cache.size > 5000) cache.clear(); // crude bound; entries are cheap to refill
  return version;
}

/** Sign the user out everywhere (their current session included). */
export async function revokeSessions(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
  cache.delete(userId);
}

/** Forget a cached version (after a bump done inside another update). */
export function forgetSessionVersion(userId: string): void {
  cache.delete(userId);
}

/*
 * Email verification tokens: same shape as password-reset tokens — the raw
 * token is emailed, only its SHA-256 is stored, 24h, single use.
 */

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Replace any outstanding token with a fresh one; returns the raw token. */
export async function issueVerifyToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(32).toString("hex");
  await prisma.emailVerificationToken.deleteMany({ where: { userId } });
  await prisma.emailVerificationToken.create({
    data: {
      tokenHash: hashToken(raw),
      userId,
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    },
  });
  return raw;
}
