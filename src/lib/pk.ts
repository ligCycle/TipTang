/**
 * PK (spec docs/superpowers/specs/2026-10-24-pk-design.md) — pure rules.
 * Two sides race for tips during a fixed window; a tip counts when it was
 * sent during the match and is confirmed. The result freezes a grace minute
 * after the end, so confirms in flight still land. Server side: src/lib/pk-server.ts.
 */

export const PK_DURATIONS = [300, 600, 900] as const;
export type PkDuration = (typeof PK_DURATIONS)[number];
export const MAX_SIDE_NAME = 20;
export const DEFAULT_SIDES = { nameA: "ทีมแดง", nameB: "ทีมน้ำเงิน", colorA: "#ef4444", colorB: "#3b82f6" } as const;

/** Two sides never share a colour: B gets blue, or red when A is already blue. */
export function distinctColorB(colorA: string, colorB: string): string {
  if (colorB !== colorA) return colorB;
  return colorA === DEFAULT_SIDES.colorB ? DEFAULT_SIDES.colorA : DEFAULT_SIDES.colorB;
}

export type PkSide = "A" | "B";
export const isPkSide = (v: unknown): v is PkSide => v === "A" || v === "B";

export function isPkDuration(v: unknown): v is PkDuration {
  return typeof v === "number" && (PK_DURATIONS as readonly number[]).includes(v);
}

export function cleanSideName(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 && s.length <= MAX_SIDE_NAME ? s : null;
}

export function cleanHex(v: unknown): string | null {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

export function winnerOf(totalA: number, totalB: number): PkSide | "draw" {
  return totalA > totalB ? "A" : totalB > totalA ? "B" : "draw";
}

/**
 * Side A's share of the bar in whole percent. 50 at 0–0; a side with any
 * money never shows as 0% while the other has some (rounded to 1–99).
 */
export function barShare(totalA: number, totalB: number): number {
  const sum = totalA + totalB;
  if (sum <= 0) return 50;
  if (totalA <= 0) return 0;
  if (totalB <= 0) return 100;
  return Math.min(99, Math.max(1, Math.round((totalA / sum) * 100)));
}

/** Whole seconds left (0 once over). */
export function remainingSec(endsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 1000));
}

/**
 * Seconds tips still being confirmed keep counting after the end: the
 * longer of what was set at the start and the creator's setting now (a
 * creator who turns auto-confirm off mid-match doesn't lose tips).
 */
export function effectiveGraceSec(storedSec: number, autoConfirmNow: boolean | null): number {
  return Math.max(storedSec, autoConfirmNow === false ? 300 : 60);
}
