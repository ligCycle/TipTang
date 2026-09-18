import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for
  // - API routes (/api)
  // - the OBS overlay (/overlay — lives outside [locale], no i18n)
  // - opengraph-image (root metadata route, no extension → would otherwise be
  //   redirected into a locale and 404, breaking link previews)
  // - Next.js internals (/_next, /_vercel)
  // - files with an extension (e.g. favicon.ico)
  matcher: ["/((?!api|overlay|opengraph-image|_next|_vercel|.*\\..*).*)"],
};
