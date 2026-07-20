import type { MetadataRoute } from "next";

const BASE = "https://tiptang.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep private/functional areas out of the index.
      disallow: [
        "/api/",
        "/overlay/",
        "/th/dashboard",
        "/en/dashboard",
        "/th/admin",
        "/en/admin",
      ],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
