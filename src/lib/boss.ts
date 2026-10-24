/**
 * "ตีบอส" (spec docs/superpowers/specs/2026-10-24-boss-design.md) — pure rules.
 * Confirmed tips deal damage, 1 baht = 1 HP. Overkill carries over to the
 * next boss (R4); after the last boss the last one keeps respawning. A run is
 * counted in "lives": life N fights boss min(N, count − 1).
 */

export const MAX_BOSSES = 10;
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
  // A guard against absurd chains (1 baht bosses and a huge tip).
  for (let guard = 0; guard < 10_000 && left > 0; guard++) {
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

/** The fan who dealt the most damage to one boss (names trimmed, case-insensitive; empty = one fan). */
export function topDamage(hits: { fan: string; amount: number }[]): { fan: string; amount: number } | null {
  const sums = new Map<string, { fan: string; amount: number }>();
  for (const h of hits) {
    const key = h.fan.trim().toLowerCase();
    const cur = sums.get(key) ?? { fan: h.fan.trim(), amount: 0 };
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
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_BOSS_HP ? v : null;
}

export function cleanBossReward(v: unknown): string | null {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v.trim() : null;
  return s !== null && s.length <= MAX_BOSS_REWARD ? s : null;
}
