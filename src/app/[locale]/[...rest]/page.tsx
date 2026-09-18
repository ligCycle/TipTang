import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

/**
 * Catch-all for URLs under a locale that match no real route
 * (/th/dashboard/nope, /th/a/b/c). Throwing notFound() here routes them
 * to [locale]/not-found.tsx, so the 404 renders inside the site shell
 * instead of Next's bare default. Single-segment paths (/th/foo) never
 * reach this — they match [username] first, which does its own lookup.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "notFound" });
  return { title: t("title"), robots: { index: false } };
}

export default function CatchAllPage() {
  notFound();
}
