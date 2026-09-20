export function formatBaht(amount: number, locale = "th-TH"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 2,
  }).format(amount);
}

// Pinned to Bangkok so the server (UTC on Vercel) and the browser render the
// same string — otherwise every date in a client component is a hydration
// mismatch (React #418). Matches the day boundaries in range.ts.
export function formatDate(date: Date | string, locale = "th-TH"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(date));
}

/**
 * Coarse "x ago" for admin tables. Pure difference → identical on server and
 * client, so it can be rendered in a server component without hydration
 * drift. Anything under a minute (or in the future) is "just now".
 */
export function relativeTime(
  date: Date,
  now: Date,
  locale: "th" | "en",
): string {
  const ms = Math.max(0, now.getTime() - date.getTime());
  const min = Math.floor(ms / 60_000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (locale === "th") {
    if (min < 1) return "เมื่อสักครู่";
    if (hr < 1) return `${min} นาทีก่อน`;
    if (day < 1) return `${hr} ชม.ก่อน`;
    return `${day} วันก่อน`;
  }
  if (min < 1) return "just now";
  if (hr < 1) return `${min} min ago`;
  if (day < 1) return `${hr} h ago`;
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
