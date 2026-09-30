import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Baseline hardening headers. HSTS is already added by Vercel.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

// Content-Security-Policy in REPORT-ONLY mode: browsers log what the policy
// would block (DevTools console) but block nothing. Once the live site runs
// clean with it, move it to the enforcing header. 'unsafe-inline' scripts are
// needed by Next's inline bootstrap and the theme script (a nonce would force
// every page to render dynamically); the other directives still cut off
// plugins, <base> hijacking, off-site form posts and data sent to hosts we
// don't use. Dev adds 'unsafe-eval' for React Refresh.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // va.vercel-scripts.com: Vercel Analytics' debug script (dev); production
  // serves it same-origin from /_vercel/insights.
  `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com",
  "media-src 'self' blob: https://*.supabase.co",
  "font-src 'self' data:",
  `connect-src 'self'${process.env.NODE_ENV === "development" ? " ws:" : ""}`,
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Clickjacking protection for everything except the OBS overlays. OBS loads
// /overlay/* top-level (not in an iframe), but some streamers wrap browser
// sources in third-party tools, so keep those pages frameable.
const NO_FRAME_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      // Supabase Storage public URLs
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...SECURITY_HEADERS,
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
      { source: "/((?!overlay/).*)", headers: NO_FRAME_HEADERS },
    ];
  },
};

export default withNextIntl(nextConfig);
