/**
 * Time-range helpers for the dashboard overview. Pure functions, no DB,
 * no "server-only" import — so they can run under `node --test`.
 *
 * All calendar arithmetic is done in Asia/Bangkok (UTC+7, no DST). Vercel
 * runs in UTC, so "today" must NOT come from `new Date().setHours(0)` — a
 * tip at 8 pm Thai time would otherwise land on tomorrow.
 */

export type Range = "today" | "7d" | "30d" | "all";
export type ChartRange = "7d" | "30d";

export const RANGES: readonly Range[] = ["today", "7d", "30d", "all"];
export const DEFAULT_RANGE: Range = "7d";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// en-CA formats as YYYY-MM-DD, which is exactly the bucket key we want.
const bangkokDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `?range=` from the URL → a known Range. Anything else is the default. */
export function parseRange(raw: string | string[] | undefined): Range {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (RANGES as readonly string[]).includes(value ?? "")
    ? (value as Range)
    : DEFAULT_RANGE;
}

/** Only multi-day ranges get a daily bar chart. */
export function hasChart(range: Range): range is ChartRange {
  return range === "7d" || range === "30d";
}

/** "YYYY-MM-DD" of the instant, in Bangkok. */
export function bangkokDayKey(d: Date): string {
  return bangkokDayFormat.format(d);
}

/** 00:00 Bangkok on the same Bangkok day as `d`, as a UTC instant. */
export function bangkokDayStart(d: Date): Date {
  const [y, m, day] = bangkokDayKey(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day) - BANGKOK_OFFSET_MS);
}

function rangeDays(range: ChartRange | "today"): number {
  return range === "today" ? 1 : range === "7d" ? 7 : 30;
}

/**
 * Earliest instant that belongs to the range, or null for "all".
 * "7d" means today plus the 6 previous calendar days — 7 bars on the chart.
 */
export function rangeStart(range: Range, now: Date): Date | null {
  if (range === "all") return null;
  const days = rangeDays(range);
  return new Date(bangkokDayStart(now).getTime() - (days - 1) * DAY_MS);
}

/** Bucket keys for the chart, oldest first, ending with today (Bangkok). */
export function dayBuckets(range: ChartRange, now: Date): string[] {
  const days = rangeDays(range);
  const start = bangkokDayStart(now).getTime() - (days - 1) * DAY_MS;
  return Array.from({ length: days }, (_, i) =>
    bangkokDayKey(new Date(start + i * DAY_MS)),
  );
}

/**
 * Sum `rows` into `keys`, then express each total as a percent of the
 * tallest bar so the chart can set bar heights directly. Rows whose day is
 * not in `keys` are ignored (they cannot happen if the DB filter matches
 * `rangeStart`, but a stray one must not throw).
 */
export function sumByDay(
  keys: string[],
  rows: { day: string; amount: number }[],
): { key: string; amount: number; pct: number }[] {
  const totals = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const row of rows) {
    const current = totals.get(row.day);
    if (current !== undefined) totals.set(row.day, current + row.amount);
  }
  const max = Math.max(0, ...totals.values());
  return keys.map((key) => {
    const amount = totals.get(key) ?? 0;
    return { key, amount, pct: max > 0 ? Math.round((amount / max) * 100) : 0 };
  });
}
