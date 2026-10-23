import { extrasFloor } from "./wishlist.ts";

/**
 * "ขอคลิป/เพลง" (fan media request) — pure rules. Fans paste a YouTube link
 * with a tip; the server keeps only the video ID, a start time and the title
 * from oEmbed (never the fan's raw URL). Server side: src/lib/media-queue.ts.
 */

export const MEDIA_DEFAULTS = { minAmount: 50, maxSec: 180, volume: 70 } as const;

/**
 * "ทดสอบบนจอ" clip: Big Buck Bunny (Blender Foundation, CC BY 3.0), short,
 * embeddable and safe to play on any stream.
 */
export const TEST_VIDEO_ID = "aqz-KE-bpKQ";

/** Maximum play length the creator can pick, in seconds. */
export const MEDIA_MAX_SEC_CHOICES = [60, 120, 180, 300, 600] as const;
export type MediaMaxSec = (typeof MEDIA_MAX_SEC_CHOICES)[number];

export function isMaxSec(v: unknown): v is MediaMaxSec {
  return typeof v === "number" && (MEDIA_MAX_SEC_CHOICES as readonly number[]).includes(v);
}

/** A start time past 12 h is junk; cap it rather than fail the link. */
const MAX_START = 43_200;
const MAX_URL = 500;
const MAX_TITLE = 200;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isVideoId(v: unknown): v is string {
  return typeof v === "string" && VIDEO_ID.test(v);
}
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** "90", "1m30s", "1h2m3s" → seconds (0 when missing or junk). */
export function parseStart(v: string | null | undefined): number {
  if (!v) return 0;
  let sec: number;
  if (/^\d+$/.test(v)) sec = Number(v);
  else {
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(v);
    if (!m || !(m[1] || m[2] || m[3])) return 0;
    sec = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  }
  return Number.isFinite(sec) ? Math.min(sec, MAX_START) : 0;
}

/**
 * A YouTube video link → its ID and start time; anything else → null.
 * Accepts watch, youtu.be, shorts, live and embed links (also without the
 * scheme), so fans can paste whatever their app's share button gives them.
 */
export function parseYouTube(raw: unknown): { videoId: string; startSec: number } | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text.length === 0 || text.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  let id: string | null = null;
  if (host === "youtu.be") {
    id = parts.length === 1 ? parts[0] : null;
  } else if (parts.length === 1 && parts[0] === "watch") {
    id = url.searchParams.get("v");
  } else if (parts.length === 2 && ["shorts", "live", "embed"].includes(parts[0])) {
    id = parts[1];
  }
  if (!id || !VIDEO_ID.test(id)) return null;

  const hashT = /(?:^|&)t=([^&]+)/.exec(url.hash.replace(/^#/, ""))?.[1];
  const startSec = parseStart(url.searchParams.get("t") ?? url.searchParams.get("start") ?? hashT ?? null);
  return { videoId: id, startSec };
}

/** oEmbed title → stored title: one line, at most 200 characters. */
export function cleanMediaTitle(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) : "";
}

/**
 * A clip still marked "playing" well past its maximum length: the OBS source
 * was closed or lost mid-clip. Counts as played so the queue moves on.
 * `since` = when the video actually started (or was handed out, if it never did).
 */
export function overdue(since: Date | null, maxSec: number, now: Date, slackSec = 60): boolean {
  return since !== null && now.getTime() - since.getTime() > (maxSec + slackSec) * 1000;
}

/** Whole seconds since the clip started (0 before it has). */
export function elapsedSec(since: Date | null, now: Date): number {
  return since ? Math.max(0, Math.floor((now.getTime() - since.getTime()) / 1000)) : 0;
}

export type ExtraKind = "media" | "wheel" | "sound";
const DROP_ORDER: ExtraKind[] = ["media", "wheel", "sound"];

/**
 * Paid extras the amount no longer covers, in the order they are dropped: the
 * clip first, then the spin, then the picked sound — until what is left fits
 * `extrasFloor`. Null = not chosen. The amount itself is never raised.
 */
export function mediaExtrasDrop(
  amount: number,
  creatorMin: number,
  prices: Record<ExtraKind, number | null>,
): ExtraKind[] {
  const kept = new Set(DROP_ORDER.filter((k) => prices[k] !== null));
  const dropped: ExtraKind[] = [];
  for (const k of DROP_ORDER) {
    if (kept.size === 0 || amount >= extrasFloor(creatorMin, [...kept].map((x) => prices[x]))) break;
    if (!kept.has(k)) continue;
    kept.delete(k);
    dropped.push(k);
  }
  return dropped;
}
