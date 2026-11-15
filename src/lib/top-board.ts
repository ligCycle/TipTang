/**
 * Top supporters bar settings (docs/superpowers/specs/2026-11-15-top-supporters-bar-design.md).
 * Pure, no "server-only" import — so it runs under `node --test`.
 */
import { RANGES, rangeStart, type Range } from "./range.ts";

export const TOP_COUNTS = [3, 5, 10] as const;
export type TopCount = (typeof TOP_COUNTS)[number];
export const DEFAULT_TOP_RANGE: Range = "30d";
export const DEFAULT_TOP_COUNT: TopCount = 5;

/** A stored or posted range, falling back to the default for anything unknown. */
export function topRangeOf(raw: unknown): Range {
  return (RANGES as readonly unknown[]).includes(raw) ? (raw as Range) : DEFAULT_TOP_RANGE;
}

/** A stored or posted row count, falling back to the default for anything unknown. */
export function topCountOf(raw: unknown): TopCount {
  const n = Number(raw);
  return (TOP_COUNTS as readonly number[]).includes(n) ? (n as TopCount) : DEFAULT_TOP_COUNT;
}

/** Tips counted from this instant (Bangkok calendar days), or null for all time. */
export function topSince(range: Range, now: Date): Date | null {
  return rangeStart(range, now);
}

export type TopFeed = { range: Range; items: { name: string; total: number }[] };
