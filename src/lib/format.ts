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
