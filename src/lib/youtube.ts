import { cleanMediaTitle, isVideoId } from "./media.ts";

/**
 * YouTube oEmbed check for "ขอคลิป/เพลง" (server only — fetches YouTube). The
 * URL is rebuilt from the 11-char ID, never taken from the fan. oEmbed is a
 * soft check: 401 (embedding off) / 404 (private, deleted) mean the clip can't
 * play; a timeout or YouTube error keeps the clip (the overlay still catches
 * one that won't play, and the fan has paid).
 */
export function oembedUrl(videoId: string): string {
  const watch = `https://www.youtube.com/watch?v=${videoId}`;
  return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`;
}

export type OEmbedResult = { ok: true; title: string | null } | { ok: false; reason: "gone" };

export async function fetchOEmbed(videoId: string, fetchImpl: typeof fetch = fetch): Promise<OEmbedResult> {
  if (!isVideoId(videoId)) return { ok: false, reason: "gone" };
  try {
    const res = await fetchImpl(oembedUrl(videoId), { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (res.status === 401 || res.status === 404) return { ok: false, reason: "gone" };
    if (!res.ok) return { ok: true, title: null };
    const body = (await res.json().catch(() => null)) as { title?: unknown } | null;
    const title = cleanMediaTitle(body?.title);
    return { ok: true, title: title.length > 0 ? title : null };
  } catch {
    return { ok: true, title: null };
  }
}
