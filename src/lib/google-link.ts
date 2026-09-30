/**
 * What to change on an existing account when its owner signs in with Google
 * (Google has just proved they control the email address).
 *
 * - Link the Google id if none is linked yet.
 * - If nobody had proven the address before, mark it proven now — and if
 *   that account has a password, drop it and bump the session version.
 *   Whoever set that password may have registered the address first to wait
 *   for its real owner (pre-account takeover). The owner can set a new one
 *   with "forgot password".
 *
 * Returns only the fields to write; an empty object means nothing to do.
 */
export function googleLinkUpdate(
  existing: {
    googleId: string | null;
    emailVerifiedAt: Date | null;
    passwordHash: string | null;
  },
  googleId: string | null,
  now: Date,
): {
  googleId?: string;
  emailVerifiedAt?: Date;
  passwordHash?: null;
  sessionVersion?: { increment: number };
} {
  const data: ReturnType<typeof googleLinkUpdate> = {};
  if (!existing.googleId && googleId) data.googleId = googleId;
  if (!existing.emailVerifiedAt) {
    data.emailVerifiedAt = now;
    if (existing.passwordHash) {
      data.passwordHash = null;
      data.sessionVersion = { increment: 1 };
    }
  }
  return data;
}
