/**
 * Pure rules for "คอมโบทิป" (a hype train). Confirmed tips from several fans in
 * a short time start a combo; each counted tip fills the current level's bar
 * and keeps the countdown alive; a full bar moves to the next level and
 * unlocks that level's reward. See docs/superpowers/specs/2026-10-23-combo-tip-design.md.
 */

/** Different fans needed within WINDOW_MS to start a combo. */
export const START_FANS = 3;
export const WINDOW_MS = 300_000;
/** Each counted tip resets the countdown to this. */
export const COUNTDOWN_MS = 300_000;
/** After a combo ends, no new one can start for this long. */
export const COOLDOWN_MS = 3_600_000;
/** How long the end summary stays on stream. */
export const SUMMARY_MS = 15_000;
/** The combo link counts as open if it was polled this recently. */
export const LIVE_MS = 120_000;
export const MAX_LEVELS = 20;
export const MAX_REWARD_TEXT = 40;
export const MAX_LEVEL_BAHT = 100_000;

export type Difficulty = "easy" | "medium" | "hard" | "custom";
export type AutoDifficulty = Exclude<Difficulty, "custom">;

export function isDifficulty(v: unknown): v is Difficulty {
  return v === "easy" || v === "medium" || v === "hard" || v === "custom";
}

/** Row i is level i + 1: the baht to fill it (custom only) and the reward unlocked on reaching it. */
export type LevelRow = { amount: number | null; reward: string };

export const DEFAULT_ROWS: LevelRow[] = [
  { amount: null, reward: "" },
  { amount: null, reward: "พูดสำเนียงที่แชทเลือก 1 นาที" },
  { amount: null, reward: "ร้อง 1 เพลงที่แชทขอ" },
  { amount: null, reward: "ตอบคำถามแชท 3 ข้อ" },
  { amount: null, reward: "ไลฟ์ต่ออีก 30 นาที" },
];

const BASE: Record<AutoDifficulty, number> = { easy: 2.5, medium: 3.5, hard: 5 };
const GROWTH = 1.3;
const MIN_TIPS_FOR_TYPICAL = 5;
const FALLBACK_TYPICAL = 50;

/** The creator's usual tip: median of recent confirmed tips, or max(minimum, ฿50) with too few. */
export function typicalTip(amounts: number[], creatorMin: number): number {
  if (amounts.length < MIN_TIPS_FOR_TYPICAL) return Math.max(creatorMin, FALLBACK_TYPICAL);
  const s = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Bar sizes for `count` levels: typical × base, then ×1.3 each level (unrounded chain), nearest ฿10, ≥ ฿10. */
export function autoSizes(typical: number, difficulty: AutoDifficulty, count: number): number[] {
  const out: number[] = [];
  let size = typical * BASE[difficulty];
  for (let i = 0; i < count; i++) {
    out.push(Math.max(10, Math.round(size / 10) * 10));
    size *= GROWTH;
  }
  return out;
}

export function sizesFor(rows: LevelRow[], difficulty: Difficulty, typical: number): number[] {
  const auto = autoSizes(typical, difficulty === "custom" ? "medium" : difficulty, rows.length);
  const ok = (a: number | null): a is number => typeof a === "number" && Number.isInteger(a) && a >= 1 && a <= MAX_LEVEL_BAHT;
  return difficulty === "custom" ? rows.map((r, i) => (ok(r.amount) ? r.amount : auto[i])) : auto;
}

/** Size of level `level` (1-based); past the table, the last size. */
export function sizeAt(sizes: number[], level: number): number {
  return sizes[Math.min(level, sizes.length) - 1];
}

/** Add baht to the current level; extra carries over. `reached` lists every level newly reached.
 *  A bad amount adds nothing; a missing or non-positive bar size stops levelling (never loops). */
export function addAmount(
  s: { level: number; progress: number },
  amount: number,
  sizes: number[],
): { level: number; progress: number; reached: number[] } {
  let { level } = s;
  const reached: number[] = [];
  if (!Number.isFinite(amount) || amount <= 0) return { level, progress: s.progress, reached };
  let progress = s.progress + amount;
  for (;;) {
    const size = sizes.length > 0 ? sizeAt(sizes, level) : NaN;
    if (!(size > 0) || progress < size) break;
    progress -= size;
    level += 1;
    reached.push(level);
  }
  return { level, progress, reached };
}

/** Take baht back (a rejected tip): the level never goes down; the bar floors at empty. */
export function removeAmount(s: { level: number; progress: number }, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return { level: s.level, progress: s.progress };
  return { level: s.level, progress: Math.max(0, s.progress - amount) };
}

/** Names that count as the same fan: trimmed, case-insensitive; every empty name is one fan. */
export function fanKey(name: string): string {
  return name.trim().toLowerCase();
}

export function countFans(names: string[]): number {
  return new Set(names.map(fanKey)).size;
}

/** The level table from a request: 1–20 rows; reward ≤ 40 chars (level 1 has none); amounts only in custom. */
export function cleanRows(v: unknown, custom: boolean): LevelRow[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_LEVELS) return null;
  const out: LevelRow[] = [];
  for (const [i, raw] of v.entries()) {
    const o = raw as Record<string, unknown> | null;
    const reward = i === 0 ? "" : typeof o?.reward === "string" ? o.reward.trim() : "";
    if (reward.length > MAX_REWARD_TEXT) return null;
    let amount: number | null = null;
    if (custom) {
      const a = o?.amount;
      if (typeof a !== "number" || !Number.isInteger(a) || a < 1 || a > MAX_LEVEL_BAHT) return null;
      amount = a;
    }
    out.push({ amount, reward });
  }
  return out;
}
