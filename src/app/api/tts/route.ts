import { rateLimit, clientIp } from "@/lib/ratelimit";

// Text-to-speech proxy. OBS's embedded browser has no built-in speech voices,
// so the overlay plays audio from here instead. We fetch a spoken-text MP3
// server-side (Google Translate TTS, client=tw-ob) and stream it back.
// Length is capped (the endpoint rejects long text) and the language is
// whitelisted.
const LANGS = new Set(["th", "en"]);

export async function GET(req: Request) {
  const limit = await rateLimit(`tts:${clientIp(req)}`, 30, 60_000);
  if (!limit.ok) {
    return new Response("rate_limited", { status: 429 });
  }

  const url = new URL(req.url);
  const text = (url.searchParams.get("text") ?? "").trim().slice(0, 200);
  const lang = url.searchParams.get("lang") ?? "th";
  if (!text || !LANGS.has(lang)) {
    return new Response("bad_request", { status: 400 });
  }

  const src = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(
    text,
  )}`;

  try {
    const upstream = await fetch(src, {
      headers: {
        // A browser-like UA is required or the endpoint returns 403.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response("tts_unavailable", { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("tts_error", { status: 502 });
  }
}
