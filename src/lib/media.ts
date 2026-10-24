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
  if (/^\d+$/.test(v)) sec = v.length > 6 ? MAX_START : Number(v);
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

  // A live stream has no fixed timeline: always join it where it is.
  if (parts[0] === "live") return { videoId: id, startSec: 0 };
  const hashT = /(?:^|&)t=([^&]+)/.exec(url.hash.replace(/^#/, ""))?.[1];
  const startSec = parseStart(url.searchParams.get("t") ?? url.searchParams.get("start") ?? hashT ?? null);
  return { videoId: id, startSec };
}

/** oEmbed title → stored title: one line, at most 200 characters. */
export function cleanMediaTitle(v: unknown): string {
  if (typeof v !== "string") return "";
  // Control and bidi/zero-width characters could spoof text on the dashboard
  // (whitespace controls become spaces); the cut never splits an emoji.
  const clean = v
    .replace(/[\t\n\v\f\r]/g, " ")
    .replace(/[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let out = "";
  for (const ch of clean) {
    if (out.length + ch.length > MAX_TITLE) break;
    out += ch;
  }
  return out;
}

/**
 * A clip still marked "playing" well past its maximum length: the OBS source
 * was closed or lost mid-clip. Counts as played so the queue moves on.
 * `since` = when the video actually started (or was handed out, if it never did);
 * `pausedMs` = time it sat paused behind a popup on the main link.
 */
export function overdue(since: Date | null, maxSec: number, now: Date, slackSec = 60, pausedMs = 0): boolean {
  return since !== null && now.getTime() - since.getTime() - pausedMs > (maxSec + slackSec) * 1000;
}

/** A pause still open counts at most this long, unless the main link is still holding it (I-2, final I1). */
export const MAX_OPEN_PAUSE_MS = 120_000;

/**
 * Total paused time of a request. An open pause counts in full while the main
 * link keeps polling with its stage busy (a long raid of alerts); otherwise
 * at most MAX_OPEN_PAUSE_MS, so a lost "resumed" can't stop the clock for good.
 */
export function pausedTotal(pausedMs: number, pausedAt: Date | null, now: Date, holding: boolean): number {
  if (!pausedAt) return pausedMs;
  const open = Math.max(0, now.getTime() - pausedAt.getTime());
  return pausedMs + (holding ? open : Math.min(MAX_OPEN_PAUSE_MS, open));
}

/** Whole seconds the clip has played (0 before it has); time paused for a popup doesn't count. */
export function elapsedSec(since: Date | null, now: Date, pausedMs = 0): number {
  return since ? Math.max(0, Math.floor((now.getTime() - since.getTime() - pausedMs) / 1000)) : 0;
}

export type ExtraKind = "media" | "gacha" | "wheel" | "sound";
/** Newest extras go first: clip/voice, then the gacha pull, the spin, the picked sound. */
const DROP_ORDER: ExtraKind[] = ["media", "gacha", "wheel", "sound"];

/**
 * Paid extras the amount no longer covers, in the order they are dropped: the
 * clip or voice first, then the gacha pull, the spin, the picked sound — until
 * what is left fits `extrasFloor`. Null or missing = not chosen. The amount
 * itself is never raised.
 */
export function mediaExtrasDrop(
  amount: number,
  creatorMin: number,
  prices: Partial<Record<ExtraKind, number | null>>,
): ExtraKind[] {
  const kept = new Set(DROP_ORDER.filter((k) => prices[k] != null));
  const dropped: ExtraKind[] = [];
  for (const k of DROP_ORDER) {
    if (kept.size === 0 || amount >= extrasFloor(creatorMin, [...kept].map((x) => prices[x] ?? null))) break;
    if (!kept.has(k)) continue;
    kept.delete(k);
    dropped.push(k);
  }
  return dropped;
}

// ---------------------------------------------------------------------------
// "ฝากเสียง" (fan voice message), recorded in the browser.

export const VOICE_MAX_SEC = 30;
/** 30 s at 64 kbps is about 240 KB; 1 MB keeps slip + voice under the host's body limit. */
export const VOICE_MAX_BYTES = 1_000_000;
/** Anything smaller is an empty or broken recording. */
export const VOICE_MIN_BYTES = 1024;
export const VOICE_DEFAULT_MIN = 30;

export type VoiceType = "audio/webm" | "audio/mp4" | "audio/ogg";
export const VOICE_EXT: Record<VoiceType, string> = { "audio/webm": "weba", "audio/mp4": "m4a", "audio/ogg": "ogg" };

/** "audio/webm;codecs=opus" → "audio/webm"; anything a recorder doesn't make → null. */
export function voiceBaseType(type: string): VoiceType | null {
  const base = type.split(";")[0].trim().toLowerCase();
  return Object.hasOwn(VOICE_EXT, base) ? (base as VoiceType) : null;
}

/** The length the fan's browser measured (display only — the player stops at 30 s). */
export function clampVoiceSec(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return VOICE_MAX_SEC;
  return Math.min(VOICE_MAX_SEC, Math.max(1, Math.round(n)));
}
