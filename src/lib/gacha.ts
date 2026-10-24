/**
 * "กาชา" (rarity capsule) — pure rules (spec docs/superpowers/specs/2026-10-23-gacha-design.md).
 * The creator sets odds for three rarities (default 70/25/5, always summing
 * to 100); a rarity with no prizes can't come out, so the odds fans see and
 * the draw both use the *effective* odds. Server side: src/lib/gacha-server.ts.
 */

export const RARITIES = ["common", "rare", "epic"] as const;
export type Rarity = (typeof RARITIES)[number];
export type Odds = Record<Rarity, number>;

export const DEFAULT_ODDS: Odds = { common: 70, rare: 25, epic: 5 };
export const DEFAULT_GACHA_PRICE = 50;
export const MAX_PRIZES_PER_RARITY = 10;
export const MAX_PRIZES = 24;
export const MAX_PRIZE_TEXT = 40;

export const isRarity = (v: unknown): v is Rarity =>
  typeof v === "string" && (RARITIES as readonly string[]).includes(v);

/**
 * Draw weights given how many live prizes each rarity has: an empty rarity
 * gets 0 and the others keep their ratio. If every rarity that has prizes was
 * set to 0%, those prizes share evenly (a fan who paid always gets something).
 */
export function effectiveOdds(odds: Odds, counts: Record<Rarity, number>): Odds {
  const out = { common: 0, rare: 0, epic: 0 };
  let any = false;
  for (const r of RARITIES) {
    if (counts[r] > 0 && odds[r] > 0) {
      out[r] = odds[r];
      any = true;
    }
  }
  if (!any) for (const r of RARITIES) if (counts[r] > 0) out[r] = 1;
  return out;
}

/** Whole percentages for display that add up to exactly 100 (largest remainder). */
export function displayPercents(weights: Odds): Odds {
  const total = RARITIES.reduce((s, r) => s + weights[r], 0);
  if (total <= 0) return { common: 0, rare: 0, epic: 0 };
  return spread(weights, 100, total);
}

function spread(weights: Odds, target: number, total: number): Odds {
  const raw = RARITIES.map((r) => ({ r, v: (weights[r] * target) / total }));
  const out = { common: 0, rare: 0, epic: 0 };
  for (const x of raw) out[x.r] = Math.floor(x.v);
  let left = target - RARITIES.reduce((s, r) => s + out[r], 0);
  for (const x of [...raw].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)))) {
    if (left <= 0) break;
    if (weights[x.r] <= 0) continue;
    out[x.r] += 1;
    left -= 1;
  }
  return out;
}

/**
 * The creator moves one slider: it takes `value` (0–100) and the other two
 * share the rest in their current ratio (evenly when both were 0).
 */
export function rebalance(odds: Odds, key: Rarity, value: number): Odds {
  const v = Math.min(100, Math.max(0, Math.round(value)));
  const others = RARITIES.filter((r) => r !== key);
  const rest = 100 - v;
  const otherTotal = others.reduce((s, r) => s + odds[r], 0);
  const base = { common: 0, rare: 0, epic: 0 };
  for (const r of others) base[r] = otherTotal > 0 ? odds[r] : 1;
  const shared = rest > 0 ? spread(base, rest, others.reduce((s, r) => s + base[r], 0)) : { common: 0, rare: 0, epic: 0 };
  return { ...shared, [key]: v } as Odds;
}

/** Odds from a request: three whole numbers 0–100 that sum to 100, or null. */
export function cleanOdds(v: unknown): Odds | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const out = { common: 0, rare: 0, epic: 0 };
  for (const r of RARITIES) {
    const n = o[r];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 100) return null;
    out[r] = n;
  }
  return out.common + out.rare + out.epic === 100 ? out : null;
}

/**
 * Pick a rarity. `randInt(n)` returns a whole number in [0, n) — the server
 * passes crypto.randomInt. Null when nothing can come out.
 */
export function drawRarity(weights: Odds, randInt: (n: number) => number): Rarity | null {
  const total = RARITIES.reduce((s, r) => s + weights[r], 0);
  if (total <= 0) return null;
  let roll = randInt(total);
  for (const r of RARITIES) {
    if (roll < weights[r]) return r;
    roll -= weights[r];
  }
  return null;
}

/** Every prize of the rarity has the same chance. */
export function drawPrize<T extends { rarity: Rarity }>(prizes: T[], rarity: Rarity, randInt: (n: number) => number): T | null {
  const pool = prizes.filter((p) => p.rarity === rarity);
  return pool.length > 0 ? pool[randInt(pool.length) % pool.length] : null;
}

export function cleanPrizeText(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > 0 && s.length <= MAX_PRIZE_TEXT ? s : null;
}

// ---------------------------------------------------------------------------
// The box a fan saw, saved on their tip (K1): the draw at confirm uses it, so
// the fan gets exactly the odds and prizes shown, even if the creator edits
// the box before confirming.

export type BoxPrize = { id: string; rarity: Rarity; text: string; imageUrl: string | null; noAction: boolean };
export type GachaBox = { odds: Odds; prizes: BoxPrize[] };

function countByRarity(prizes: { rarity: Rarity }[]): Record<Rarity, number> {
  const counts = { common: 0, rare: 0, epic: 0 };
  for (const p of prizes) counts[p.rarity] += 1;
  return counts;
}

/** What fans see for this box: whole percentages per rarity, summing to 100. */
export function boxOdds(box: GachaBox): Odds {
  return displayPercents(effectiveOdds(box.odds, countByRarity(box.prizes)));
}

/** Draw a rarity by the effective odds of the box, then a prize evenly within it. */
export function drawFromBox(box: GachaBox, randInt: (n: number) => number): { rarity: Rarity; prize: BoxPrize } | null {
  const rarity = drawRarity(effectiveOdds(box.odds, countByRarity(box.prizes)), randInt);
  if (!rarity) return null;
  const prize = drawPrize(box.prizes, rarity, randInt);
  return prize ? { rarity, prize } : null;
}

/** A stored box (Json) that still has the shape the draw needs. */
export function isGachaBox(v: unknown): v is GachaBox {
  if (!v || typeof v !== "object") return false;
  const b = v as { odds?: unknown; prizes?: unknown };
  if (!b.odds || typeof b.odds !== "object") return false;
  const o = b.odds as Record<string, unknown>;
  if (!RARITIES.every((r) => typeof o[r] === "number" && Number.isInteger(o[r]) && (o[r] as number) >= 0)) return false;
  return (
    Array.isArray(b.prizes) &&
    b.prizes.every((p) => {
      const x = p as Record<string, unknown>;
      return (
        Boolean(x) &&
        typeof x.id === "string" &&
        isRarity(x.rarity) &&
        typeof x.text === "string" &&
        (x.imageUrl === null || typeof x.imageUrl === "string") &&
        typeof x.noAction === "boolean"
      );
    })
  );
}

/**
 * Prizes must not be money or worth money (a paid random draw for money looks
 * like a lottery under Thai law). A soft check on the creator's text.
 */
const MONEY =
  /฿|\$|[0-9๐-๙][0-9๐-๙,]*\s*(บ\.?(?![ก-๙])|thb|baht)|บาท(?!หลวง)|เงินสด|เงินรางวัล|โอนเงิน|แจกเงิน|ให้เงิน|พร้อมเพย์|promptpay|ทรูมันนี่|truemoney|บัตรเติม|บัตรของขวัญ|เติมเกม|ทองคำ|robux|wallet|gift[ -]?card|voucher|\bcash\b/i;
export function looksLikeMoney(text: string): boolean {
  return MONEY.test(text);
}
