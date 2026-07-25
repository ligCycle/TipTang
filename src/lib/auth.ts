import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateUniqueUsername } from "@/lib/username";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
    authorize: async (raw) => {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;

      const user = await prisma.user.findUnique({
        where: { email: parsed.data.email.toLowerCase() },
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

      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      // Existing account → sign in, but DON'T touch their data (esp. avatarUrl).
      if (existing) return true;

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

    // Inject OUR user id into the token. Hit the DB ONLY on first sign-in
    // (when `user` is present) — this callback runs on every session check, so
    // querying every time would flood the connection pool.
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
          token.id = user.id as string; // credentials → already our id, no DB
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
