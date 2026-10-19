/**
 * Sound sets ("ชุด"): a creator groups library files into sets; the active
 * set drives normal alerts (random sound / visual) and the sounds fans may
 * pick on the donate page. A sound's minimum tip applies everywhere — it only
 * plays on tips of at least that amount, picked or random.
 */

export const MAX_SETS = 10;
export const MAX_NAME = 40;
export const MAX_PRICE = 100000;
export const DEFAULT_SET_NAME = "ชุดหลัก";

export type SetSound = { url: string; minAmount: number };
export type NormalMedia = { sounds: SetSound[]; images: string[]; videos: string[] };

/** The active set's media a tip of `amount` may draw from at random. */
export function poolsForAmount(
  media: NormalMedia,
  amount: number,
): { sounds: string[]; images: string[]; videos: string[] } {
  return {
    sounds: media.sounds.filter((s) => s.minAmount <= amount).map((s) => s.url),
    images: media.images,
    videos: media.videos,
  };
}

export type PickCandidate = {
  assetId: string;
  kind: "SOUND" | "STICKER" | "VIDEO";
  fanPickable: boolean;
  minAmount: number;
};

/**
 * Whether a fan's pick stands: a fan-pickable sound in the active set, with
 * the tip covering both its minimum and the creator's general minimum.
 */
export function validatePick(
  activeItems: PickCandidate[],
  assetId: string | null,
  amount: number,
  creatorMin: number,
): { ok: true; assetId: string } | { ok: false; reason: "none" | "unavailable" | "too_low" } {
  if (!assetId) return { ok: false, reason: "none" };
  const item = activeItems.find((i) => i.assetId === assetId);
  if (!item || item.kind !== "SOUND" || !item.fanPickable) return { ok: false, reason: "unavailable" };
  if (amount < Math.max(item.minAmount, creatorMin)) return { ok: false, reason: "too_low" };
  return { ok: true, assetId };
}

/**
 * The fan's picked sound beats the tier's and the set's. Over a video it
 * still plays — the video is muted so the two don't clash.
 */
export function applyPick<T extends { soundUrl: string | null; videoUrl: string | null }>(
  media: T,
  pickedUrl: string | null,
): T & { videoMuted: boolean } {
  if (!pickedUrl) return { ...media, videoMuted: false };
  return { ...media, soundUrl: pickedUrl, videoMuted: Boolean(media.videoUrl) };
}

/** A set or sound name: trimmed, 1..MAX_NAME characters, else null. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name.length > 0 && name.length <= MAX_NAME ? name : null;
}

/** A sound's minimum tip: whole baht 0..MAX_PRICE (0 = free), else null. */
export function cleanPrice(raw: unknown): number | null {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_PRICE ? n : null;
}

/**
 * "เสียง N" for an unnamed sound: its place among all the creator's sounds,
 * oldest first — the same number on the library page, the donate page and the
 * tip badge. 0 = not in the list.
 */
export function libraryNumber(orderedIds: string[], id: string): number {
  return orderedIds.indexOf(id) + 1;
}

/** Version of a creator's active-set media; overlays refresh when it changes. */
export function setVersion(setId: string | null, updatedAt: Date | null): string {
  return `${setId ?? ""}:${updatedAt?.getTime() ?? 0}`;
}
