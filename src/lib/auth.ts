import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateUniqueUsername } from "@/lib/username";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import {
  currentSessionVersion,
  forgetSessionVersion,
} from "@/lib/account-security";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Surfaces as `code: "rate_limited"` on the client's signIn() result.
class LoginRateLimited extends CredentialsSignin {
  code = "rate_limited";
}

const MIN = 60_000;

/**
 * Password-guessing brake, checked before any DB lookup or bcrypt work.
 * Every attempt counts (the limiter has no "peek"), so the numbers leave room
 * for a real person fumbling their password: per IP 20 / 15 min (shared
 * mobile/campus IPs), per account 10 / 15 min and 30 / day — the daily cap is
 * what actually stops slow guessing. The account key is a hash so Redis never
 * holds raw email addresses.
 */
async function loginAllowed(email: string, req: Request): Promise<boolean> {
  const who = createHash("sha256").update(email).digest("hex").slice(0, 32);
  const checks = [
    [`login-ip:${clientIp(req)}`, 20, 15 * MIN],
    [`login-acct:${who}`, 10, 15 * MIN],
    [`login-acct-day:${who}`, 30, 24 * 60 * MIN],
  ] as const;
  for (const [key, limit, windowMs] of checks) {
    if (!(await rateLimit(key, limit, windowMs)).ok) return false;
  }
  return true;
}

// Shape of the bits of the Google profile we read.
type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

// Build the providers list. Google only appears when its keys are configured,
// so the "Continue with Google" button only shows when it actually works.
const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: async (raw, request) => {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const email = parsed.data.email.trim().toLowerCase();
      if (!(await loginAllowed(email, request))) throw new LoginRateLimited();

      const user = await prisma.user.findUnique({
        where: { email },
      });
      if (!user) return null;
      // OAuth-only accounts have no password → can't sign in via this form.
      if (!user.passwordHash) return null;

      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) return null;

      return { id: user.id, email: user.email, name: user.displayName };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Credentials provider REQUIRES the JWT session strategy (no DB sessions).
  session: { strategy: "jwt" },
  trustHost: true,
  providers,
  callbacks: {
    // On Google sign-in, upsert our own User row (we don't use an adapter).
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;

      const p = (profile ?? {}) as GoogleProfile;
      const email = (p.email ?? "").toLowerCase();
      // Only link/create for a Google-verified email.
      if (!email || p.email_verified !== true) return false;
      const googleId = account.providerAccountId || null;

      const existing = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          googleId: true,
          emailVerifiedAt: true,
          passwordHash: true,
        },
      });
      // Existing account → sign in. Link Google (set googleId) if not linked yet,
      // but DON'T touch other data (esp. avatarUrl).
      if (existing) {
        const data: Prisma.UserUpdateInput = {};
        if (!existing.googleId && googleId) data.googleId = googleId;
        if (!existing.emailVerifiedAt) {
          // Google just proved who owns this address. A password set before
          // anyone proved it may belong to someone who registered the
          // address first to wait for its owner (pre-account takeover):
          // drop it and sign out their sessions. The owner can set a new
          // one with "forgot password".
          data.emailVerifiedAt = new Date();
          if (existing.passwordHash) {
            data.passwordHash = null;
            data.sessionVersion = { increment: 1 };
          }
        }
        if (Object.keys(data).length > 0) {
          await prisma.user
            .update({ where: { id: existing.id }, data })
            .catch(() => {});
          forgetSessionVersion(existing.id);
        }
        return true;
      }

      const displayName = p.name || email.split("@")[0];
      const avatarUrl = p.picture || null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await prisma.user.create({
            data: {
              email,
              displayName,
              username: await generateUniqueUsername(email, p.name),
              passwordHash: null,
              avatarUrl,
              googleId,
              emailVerifiedAt: new Date(),
            },
          });
          break;
        } catch {
          // Race: if the account now exists (email), we're done; otherwise it
          // was a username collision — loop retries with a fresh username.
          const now = await prisma.user.findUnique({
            where: { email },
            select: { id: true },
          });
          if (now) break;
        }
      }
      return true;
    },

    // Inject OUR user id + session version into the token on sign-in, then
    // on every later check make sure the version still matches (see
    // account-security.ts — a bump signs out every device). This callback
    // runs on every session check; the version lookup is cached briefly so
    // it doesn't flood the connection pool.
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          const email = (user.email ?? "").toLowerCase();
          if (email) {
            const db = await prisma.user.findUnique({
              where: { email },
              select: { id: true },
            });
            if (db) token.id = db.id;
          }
        } else {
          token.id = user.id as string; // credentials → already our id
        }
        if (typeof token.id === "string") {
          token.sv = (await currentSessionVersion(token.id)) ?? 0;
        }
        return token;
      }
      if (typeof token.id === "string") {
        try {
          const current = await currentSessionVersion(token.id);
          // Deleted account, or signed out everywhere since this token was
          // issued. Tokens from before versioning count as version 0.
          if (current === null || current !== (token.sv ?? 0)) return null;
        } catch {
          // DB hiccup: keep the session rather than logging everyone out.
        }
      }
      return token;
    },
    // Expose the id on the session so auth() in Server Components has it.
    session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },
});

/**
 * Session guard for the pages under /dashboard.
 * The guard in dashboard/layout.tsx is NOT enough on its own: Next renders the
 * layout and the page in PARALLEL, so the page still runs — and would crash on
 * a null session — before the layout's redirect lands. Every page checks too.
 * Returns null when signed out; the caller redirects (same shape as requireAdmin).
 */
export async function requireUser() {
  const session = await auth();
  // `id` is only set by the session callback above when token.id is a string,
  // so an old/odd JWT can carry a `user` with no id — that must not reach Prisma.
  if (!session?.user?.id) return null;
  return session.user;
}
