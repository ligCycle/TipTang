import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { routing } from "@/i18n/routing";

const BASE = "https://tiptang.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const users = await prisma.user.findMany({
    select: { username: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const entries: MetadataRoute.Sitemap = [];

  // Landing page (each locale).
  for (const locale of routing.locales) {
    entries.push({
      url: `${BASE}/${locale}`,
      changeFrequency: "weekly",
      priority: locale === routing.defaultLocale ? 1 : 0.9,
    });
  }

  // Getting-started guide (each locale).
  for (const locale of routing.locales) {
    entries.push({
      url: `${BASE}/${locale}/start`,
      changeFrequency: "monthly",
      priority: 0.7,
    });
  }

  // Public creator profiles (each locale).
  for (const u of users) {
    for (const locale of routing.locales) {
      entries.push({
        url: `${BASE}/${locale}/${u.username}`,
        lastModified: u.updatedAt,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  return entries;
}
