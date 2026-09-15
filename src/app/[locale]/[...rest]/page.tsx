import { notFound } from "next/navigation";

/**
 * Catch-all for URLs under a locale that match no real route
 * (/th/dashboard/nope, /th/a/b/c). Throwing notFound() here routes them
 * to [locale]/not-found.tsx, so the 404 renders inside the site shell
 * instead of Next's bare default. Single-segment paths (/th/foo) never
 * reach this — they match [username] first, which does its own lookup.
 */
export default function CatchAllPage() {
  notFound();
}
