import { auth } from "@/lib/auth";

/**
 * Platform admin = the email listed in ADMIN_EMAIL (comma-separated allowed).
 * Reviews are about the whole site, so only the platform owner moderates them
 * — not individual creators.
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export async function requireAdmin() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) return null;
  return session;
}
