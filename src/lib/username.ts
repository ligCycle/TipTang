import "server-only";
import { prisma } from "@/lib/prisma";

// Username rules (see usernameSchema): 3-30 chars, [a-z0-9_].
const MIN_LEN = 3;
const MAX_LEN = 30;

/** Keep only the allowed username characters. */
function sanitize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, MAX_LEN);
}

function randomSuffix(): string {
  // 3–4 digit suffix; avoids Math.random pitfalls elsewhere but fine here.
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Build a unique username for an OAuth signup. Seeds from the email local part
 * first (usually ASCII, e.g. "somchai.rak") then the display name. Thai names
 * strip to empty under the [a-z0-9_] rule, so anything shorter than the minimum
 * falls back to "creator" + digits. Retries on the unique constraint.
 */
export async function generateUniqueUsername(
  email: string,
  name?: string | null,
): Promise<string> {
  const local = email.split("@")[0] ?? "";
  let base = sanitize(local);
  if (base.length < MIN_LEN && name) base = sanitize(name);
  if (base.length < MIN_LEN) base = `creator${randomSuffix()}`;
  base = base.slice(0, MAX_LEN - 5); // leave room for a suffix

  // Try the base, then base+random until a free one is found.
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 && base.length >= MIN_LEN ? base : `${base}${randomSuffix()}`;
    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  // Extremely unlikely fallback.
  return `creator${Date.now().toString(36)}`.slice(0, MAX_LEN);
}
