/**
 * "ขอคลิป/เพลง" (fan media request) — pure rules. Fans paste a YouTube link
 * with a tip; the server keeps only the video ID, a start time and the title
 * from oEmbed (never the fan's raw URL). Server side: src/lib/media-server.ts.
 */

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
 */
export function overdue(startedAt: Date | null, maxSec: number, now: Date): boolean {
  return startedAt !== null && now.getTime() - startedAt.getTime() > (maxSec + 30) * 1000;
}
