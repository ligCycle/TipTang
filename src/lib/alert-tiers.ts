/**
 * Alert tiers by amount: a creator sets up to MAX_TIERS minimum amounts, and a
 * tip at or above a tier's minimum plays that tier's sound / visual / time on
 * screen instead of the normal alert's. Anything a tier leaves empty comes
 * from the normal alert. Tier assets are library URLs; one deleted from the
 * library falls back to the normal asset.
 */

export const MAX_TIERS = 5;
export const MIN_DURATION_SEC = 3;
export const MAX_DURATION_SEC = 60;

export type AlertTier = {
  minAmount: number;
  soundUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  durationSec: number | null;
};

export type AlertBase = {
  soundUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  durationSec: number;
};

/** The tier with the highest minimum at or below `amount`; null below all. */
export function pickTier(tiers: AlertTier[], amount: number): AlertTier | null {
  let best: AlertTier | null = null;
  for (const t of tiers) {
    if (t.minAmount <= amount && (!best || t.minAmount > best.minAmount)) best = t;
  }
  return best;
}

export function resolveAlert(
  base: AlertBase,
  tier: AlertTier | null,
  libraryUrls: Set<string>,
): AlertBase {
  if (!tier) return base;
  const usable = (u: string | null) => (u && libraryUrls.has(u) ? u : null);
  const sound = usable(tier.soundUrl);
  const video = usable(tier.videoUrl);
  const image = video ? null : usable(tier.imageUrl);
  // A tier visual (image or video) replaces the normal visual entirely.
  const visual =
    video || image
      ? { imageUrl: image, videoUrl: video }
      : { imageUrl: base.imageUrl, videoUrl: base.videoUrl };
  return {
    soundUrl: sound ?? base.soundUrl,
    ...visual,
    durationSec: tier.durationSec ?? base.durationSec,
  };
}

const optUrl = (v: unknown): v is string | null =>
  v === null || v === undefined || (typeof v === "string" && v.length > 0 && v.length <= 2048);

export function normalizeTiers(
  input: unknown,
):
  | { ok: true; tiers: AlertTier[] }
  | { ok: false; error: "too_many" | "invalid" | "duplicate" } {
  if (!Array.isArray(input)) return { ok: false, error: "invalid" };
  if (input.length > MAX_TIERS) return { ok: false, error: "too_many" };
  const tiers: AlertTier[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { ok: false, error: "invalid" };
    const r = raw as Record<string, unknown>;
    const min = r.minAmount;
    const dur = r.durationSec ?? null;
    if (typeof min !== "number" || !Number.isInteger(min) || min < 1 || min > 1_000_000) {
      return { ok: false, error: "invalid" };
    }
    if (
      dur !== null &&
      (typeof dur !== "number" ||
        !Number.isInteger(dur) ||
        dur < MIN_DURATION_SEC ||
        dur > MAX_DURATION_SEC)
    ) {
      return { ok: false, error: "invalid" };
    }
    if (!optUrl(r.soundUrl) || !optUrl(r.imageUrl) || !optUrl(r.videoUrl)) {
      return { ok: false, error: "invalid" };
    }
    tiers.push({
      minAmount: min,
      soundUrl: (r.soundUrl as string | null | undefined) ?? null,
      imageUrl: (r.imageUrl as string | null | undefined) ?? null,
      videoUrl: (r.videoUrl as string | null | undefined) ?? null,
      durationSec: dur as number | null,
    });
  }
  if (new Set(tiers.map((t) => t.minAmount)).size !== tiers.length) {
    return { ok: false, error: "duplicate" };
  }
  tiers.sort((a, b) => a.minAmount - b.minAmount);
  return { ok: true, tiers };
}
