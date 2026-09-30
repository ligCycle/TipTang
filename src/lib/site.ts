export const SITE_URL = "https://tiptang.com";

/**
 * Base for links we put in emails. Production always uses the canonical
 * domain — never the request's Host header, which a client controls. Other
 * environments (localhost, preview deploys) link back to themselves so the
 * flows stay testable there.
 */
export function linkBase(req: Request): string {
  return process.env.VERCEL_ENV === "production"
    ? SITE_URL
    : new URL(req.url).origin;
}
