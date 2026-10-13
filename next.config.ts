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

// Content-Security-Policy, currently in REPORT-ONLY mode: browsers log what the
// policy would block (DevTools console) but block nothing. Once the live site
// runs clean with it, set CSP_ENFORCE = true below — that is the only change
// needed (see headers() for why there is exactly one CSP header per page).
// 'unsafe-inline' scripts are
// needed by Next's inline bootstrap and the theme script (a nonce would force
// every page to render dynamically); the other directives still cut off
// plugins, <base> hijacking, off-site form posts and data sent to hosts we
// don't use. Dev adds 'unsafe-eval' for React Refresh.
const CSP_BASE = [
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

// Flip to true to enforce the policy. Until then it only reports.
const CSP_ENFORCE = false;
const CSP_KEY = CSP_ENFORCE
  ? "Content-Security-Policy"
  : "Content-Security-Policy-Report-Only";

// Clickjacking protection for everything except the OBS overlays. OBS loads
// /overlay/* top-level (not in an iframe), but some streamers wrap browser
// sources in third-party tools, so keep those pages frameable.
//
// Next lets the LAST matching rule win when two rules set the same header key,
// so the policy must live in ONE header per page: frame-ancestors is a
// directive of the same policy, not a second Content-Security-Policy header.
// While the policy is report-only, frame-ancestors is also sent as its own
// enforcing header so framing stays blocked (X-Frame-Options backs it up).
const FRAME_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: CSP_KEY, value: `${CSP_BASE}; frame-ancestors 'none'` },
  ...(CSP_ENFORCE
    ? []
    : [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }]),
];
// Overlays: same policy, no frame-ancestors, no X-Frame-Options.
const OVERLAY_HEADERS = [{ key: CSP_KEY, value: CSP_BASE }];

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
      // Two disjoint rules (overlay / everything else) so no header key is set
      // twice for the same path.
      { source: "/overlay/:path*", headers: [...SECURITY_HEADERS, ...OVERLAY_HEADERS] },
      { source: "/((?!overlay/).*)", headers: [...SECURITY_HEADERS, ...FRAME_HEADERS] },
    ];
  },
};

export default withNextIntl(nextConfig);
