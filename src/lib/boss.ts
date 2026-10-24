/**
 * "ตีบอส" (spec docs/superpowers/specs/2026-10-24-boss-design.md) — pure rules.
 * Confirmed tips deal damage, 1 baht = 1 HP. Overkill carries over to the
 * next boss (R4); after the last boss the last one keeps respawning. A run is
 * counted in "lives": life N fights boss min(N, count − 1).
 */

import { fanKey } from "./combo.ts";

export const MAX_BOSSES = 10;
export const MIN_BOSS_HP = 10;
/** One tip defeats at most this many bosses; damage beyond it is not counted (C6). */
export const MAX_KILLS_PER_TIP = 100;
/** How an empty supporter name shows (C7). */
export const ANON_FAN = "ผู้สนับสนุน";
export const MAX_BOSS_NAME = 30;
export const MAX_BOSS_HP = 1_000_000;
export const MAX_BOSS_REWARD = 40;

export type BossState = { life: number; damage: number };
export type BossPiece = { life: number; amount: number };

/** Which boss (index in the list) fights at this life; −1 when there are none. */
export function bossAt(hps: number[], life: number): number {
  return hps.length === 0 ? -1 : Math.min(life, hps.length - 1);
}

/**
 * Deal `amount` damage. Returns the new state, how much landed on each life
 * (for a later reject and for "top damage") and which lives were defeated.
 */
export function applyDamage(
  s: BossState,
  amount: number,
  hps: number[],
): { life: number; damage: number; pieces: BossPiece[]; kills: number[] } {
  let { life, damage } = s;
  const pieces: BossPiece[] = [];
  const kills: number[] = [];
  if (hps.length === 0 || !Number.isFinite(amount) || amount <= 0) return { life, damage, pieces, kills };
  let left = amount;
  while (left > 0 && kills.length < MAX_KILLS_PER_TIP) {
    const hp = hps[bossAt(hps, life)];
    if (!(hp > 0)) break;
    const need = Math.max(0, hp - damage);
    if (left < need) {
      pieces.push({ life, amount: left });
      damage += left;
      left = 0;
      break;
    }
    if (need > 0) pieces.push({ life, amount: need });
    left -= need;
    kills.push(life);
    life += 1;
    damage = 0;
  }
  return { life, damage, pieces, kills };
}

/** A confirmed tip was rejected: only its damage on the current boss comes off (B2). */
export function undoDamage(s: BossState, tipPieces: BossPiece[]): BossState {
  const onCurrent = tipPieces.filter((p) => p.life === s.life).reduce((sum, p) => sum + p.amount, 0);
  return { life: s.life, damage: Math.max(0, s.damage - onCurrent) };
}

/** A supporter name for display: trimmed, or the generic supporter when empty. */
export function fanName(name: string): string {
  return name.trim() || ANON_FAN;
}

/**
 * The fan who dealt the most damage to one boss (grouped like the combo's
 * fanKey). Hits come in time order, so on a tie the earliest fan wins.
 */
export function topDamage(hits: { fan: string; amount: number }[]): { fan: string; amount: number } | null {
  const sums = new Map<string, { fan: string; amount: number }>();
  for (const h of hits) {
    const key = fanKey(h.fan);
    const cur = sums.get(key) ?? { fan: fanName(h.fan), amount: 0 };
    cur.amount += h.amount;
    sums.set(key, cur);
  }
  let best: { fan: string; amount: number } | null = null;
  for (const v of sums.values()) if (!best || v.amount > best.amount) best = v;
  return best;
}

export function cleanBossName(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 && s.length <= MAX_BOSS_NAME ? s : null;
}

export function cleanBossHp(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= MIN_BOSS_HP && v <= MAX_BOSS_HP ? v : null;
}

export function cleanBossReward(v: unknown): string | null {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v.trim() : null;
  return s !== null && s.length <= MAX_BOSS_REWARD ? s : null;
}

/** The boss card the OBS link shows. `index` is 1-based in the live list. */
export type BossView = { id: string; name: string; imageUrl: string | null; hp: number; damage: number; index: number; total: number };
/** One defeated boss for the banner. */
export type BossKillView = {
  id: string;
  bossName: string;
  hp: number;
  reward: string;
  imageUrl: string | null;
  killer: string;
  topFan: string;
  topAmount: number;
};
/** More than CHAIN_AT kills waiting at once play as one summary card (R4). */
export const CHAIN_AT = 3;
export type BossChain = { id: string; count: number; lastKiller: string };
export type BossFeed =
  | { phase: "off" }
  | {
      phase: "live";
      run: number;
      life: number;
      bossDefId: string;
      boss: BossView;
      kill: BossKillView | null;
      chain: BossChain | null;
      /** Kills still waiting after this one (the next poll claims them). */
      pending: number;
      test?: boolean;
    };

export type BossTest = { id: string; startedAt: number; name: string; hp: number; imageUrl: string | null };
export const TEST_KILL_MS = 7_500;
const TEST_TICK_MS = 1_500;

/** The scripted OBS test: a fifth of the HP every 1.5 s, the kill at 7.5 s, then a fresh boss. */
export function bossTestFeed(t: BossTest, now: number): BossFeed {
  const elapsed = Math.max(0, now - t.startedAt);
  const killed = elapsed >= TEST_KILL_MS;
  const damage = killed ? 0 : Math.min(t.hp - 1, Math.round((t.hp * Math.floor(elapsed / TEST_TICK_MS)) / 5));
  return {
    phase: "live",
    run: -1,
    life: killed ? 1 : 0,
    bossDefId: "test",
    boss: { id: "test", name: t.name, imageUrl: t.imageUrl, hp: t.hp, damage, index: 1, total: 1 },
    kill: killed
      ? {
          id: t.id,
          bossName: t.name,
          hp: t.hp,
          reward: "รางวัลตัวอย่าง",
          imageUrl: t.imageUrl,
          killer: "ผู้สนับสนุนตัวอย่าง",
          topFan: "ผู้สนับสนุนตัวอย่าง",
          topAmount: t.hp,
        }
      : null,
    chain: null,
    pending: 0,
    test: true,
  };
}
