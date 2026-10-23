"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_COLOR } from "@/lib/colors";
import { Icon } from "@/components/Icon";
import type { MediaFeed } from "@/lib/media-queue";

const POLL_MS = 3000;
/** A clip that hasn't started playing by then can't play here: next one. */
const WATCHDOG_MS = 20_000;
/** A normal browser tab blocks sound autoplay; offer a click after this. */
const AUTOPLAY_CHECK_MS = 2000;

// The bits of the YouTube IFrame API used here.
type YTPlayer = {
  playVideo(): void;
  setVolume(v: number): void;
  getPlayerState(): number;
  destroy(): void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      host: string;
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
    obsstudio?: unknown;
  }
}

const PLAYING = 1;
const ENDED = 0;
/** The video itself can't play anywhere (gone, private, embedding off). */
const CLIP_ERRORS = new Set([100, 101, 150]);

let apiReady: Promise<YTNamespace> | null = null;
function loadYouTube(): Promise<YTNamespace> {
  if (apiReady) return apiReady;
  apiReady = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return apiReady;
}

/**
 * The fan media OBS link ("ขอคลิป/เพลง" clips and "ฝากเสียง" voice messages).
 * The server owns the queue: this plays whatever it hands out and reports
 * started / ended / error. Clips seek past what already played after a
 * refresh; voice messages (no reliable duration in recorder files) start over.
 * Problems that belong to this source only (player errors 2/5/153, a browser
 * tab blocking autoplay) are never reported, so a broken preview can't skip
 * the request for the real OBS source.
 */
export function MediaOverlayClient({ username, apiKey }: { username: string; apiKey: string }) {
  const [feed, setFeed] = useState<MediaFeed | null>(null);
  const [needsClick, setNeedsClick] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  // Voice: when playback began (drives the progress bar).
  const [voiceStart, setVoiceStart] = useState<number | null>(null);
  const loadedId = useRef<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The watchdog reads the latest "needs a click" without re-running the effect.
  const needsClickRef = useRef(false);
  useEffect(() => {
    needsClickRef.current = needsClick;
  }, [needsClick]);

  const url = `/api/overlay/${username}/media?key=${encodeURIComponent(apiKey)}`;

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok && active) setFeed((await res.json()) as MediaFeed);
      } catch {
        // Network blip: try again next tick.
      }
    }
    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [url]);

  const current = feed?.current ?? null;
  const volume = feed?.volume ?? 70;

  // Player methods exist only once it is ready; onReady reads the newest volume.
  const ready = useRef(false);
  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
    if (ready.current) player.current?.setVolume(volume);
    if (audio.current) audio.current.volume = volume / 100;
  }, [volume]);

  useEffect(() => {
    if ((current?.id ?? null) === loadedId.current) return;
    const clearTimers = () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    };
    clearTimers();
    ready.current = false;
    player.current?.destroy();
    player.current = null;
    stopAudio(audio);
    setVoiceStart(null);
    loadedId.current = current?.id ?? null;
    setNeedsClick(false);
    if (!current || !box.current) return;

    const clip = current;
    const maxSec = clip.maxSec;
    const report = (event: "started" | "ended" | "error") =>
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: clip.id, event }) }).catch(() => {});
    let started = false;
    let retried = false;
    let sourceBroken = false;
    // Never started (premiere, blocked in this region, endless ad): move on —
    // unless the problem is this source (broken player, blocked autoplay).
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (!started && !sourceBroken && (window.obsstudio || !needsClickRef.current)) void report("error");
      }, WATCHDOG_MS);
      timers.current.push(watchdog);
    };
    // Refreshed after the clip's time was already up (the server allows a
    // grace minute): it's done.
    if (clip.elapsedSec >= maxSec) {
      void report("ended");
      return;
    }

    if (clip.kind === "voice") {
      box.current.replaceChildren();
      if (!clip.audioUrl) {
        void report("error");
        return;
      }
      const el = new Audio(clip.audioUrl);
      el.preload = "auto";
      el.volume = volumeRef.current / 100;
      audio.current = el;
      armWatchdog();
      const begin = () => {
        if (started) return;
        started = true;
        setNeedsClick(false);
        setVoiceStart(Date.now());
        void report("started");
        // The player enforces the 30 s limit itself (recorder files carry no
        // reliable duration).
        timers.current.push(
          setTimeout(() => {
            stopAudio(audio);
            void report("ended");
          }, maxSec * 1000),
        );
      };
      el.addEventListener("playing", begin);
      el.addEventListener("ended", () => {
        if (started) void report("ended");
      });
      el.addEventListener("error", () => void report("error"));
      el.play().catch((e: unknown) => {
        // A normal browser tab blocks sound until a click; OBS doesn't. A
        // play cut short because this voice was skipped is not that.
        if (audio.current !== el || (e instanceof DOMException && e.name === "AbortError")) return;
        if (!window.obsstudio) setNeedsClick(true);
      });
      return undefined;
    }

    const create = async () => {
      // The IFrame API sends this page's address to YouTube (forigin): take
      // the overlay key out of it first. OBS reloads its saved link, so it
      // keeps working; the key stays in memory for the feed calls.
      if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
      const YT = await loadYouTube();
      if (loadedId.current !== clip.id || !box.current) return;
      ready.current = false;
      player.current?.destroy();
      player.current = null;
      box.current.replaceChildren();
      armWatchdog();
      const el = document.createElement("div");
      box.current.appendChild(el);
      const startAt = clip.startSec + clip.elapsedSec;
      player.current = new YT.Player(el, {
        host: "https://www.youtube-nocookie.com",
        videoId: clip.videoId ?? "",
        width: "640",
        height: "360",
        playerVars: {
          autoplay: 1,
          controls: 0,
          rel: 0,
          playsinline: 1,
          start: startAt,
          end: clip.startSec + maxSec,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            ready.current = true;
            player.current?.setVolume(volumeRef.current);
            player.current?.playVideo();
            timers.current.push(
              setTimeout(() => {
                // OBS plays sound without a click; a normal browser tab doesn't.
                if (!started && !window.obsstudio) setNeedsClick(true);
              }, AUTOPLAY_CHECK_MS),
            );
          },
          onStateChange: (e) => {
            if (e.data === PLAYING && !started) {
              started = true;
              setNeedsClick(false);
              void report("started");
            } else if (e.data === ENDED && started) {
              void report("ended");
            }
          },
          onError: (e) => {
            if (CLIP_ERRORS.has(e.data)) {
              void report("error");
            } else if (!retried) {
              retried = true;
              void create();
            } else sourceBroken = true;
          },
        },
      });
    };
    void create();
    return undefined;
  }, [current, url]);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
      player.current?.destroy();
      stopAudio(audio);
    },
    [],
  );

  const color = feed?.color && /^#[0-9a-fA-F]{6}$/.test(feed.color) ? feed.color : DEFAULT_COLOR;

  return (
    <div className={`mx-auto w-[640px] ${current ? "" : "invisible"}`}>
      <div
        className={`relative w-[640px] overflow-hidden rounded-2xl ${current?.kind === "voice" ? "h-[120px] bg-[#120c16]/90" : "h-[360px] bg-black"}`}
      >
        <div ref={box} className={current?.kind === "voice" ? "hidden" : "h-full w-full"} />
        {current?.kind === "voice" && (
          <div className="flex h-full items-center gap-4 px-6">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-white" style={{ background: color }}>
              <Icon name="mic" className="h-8 w-8" />
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/15">
              {/* A fresh bar when playback begins, filling over the voice's length. */}
              <style>{"@keyframes media-voice-bar{from{width:0%}to{width:100%}}"}</style>
              <div
                key={voiceStart ?? 0}
                className="h-full rounded-full"
                style={{
                  background: color,
                  width: voiceStart ? undefined : "0%",
                  animation: voiceStart
                    ? `media-voice-bar ${Math.min(current.durationSec ?? current.maxSec, current.maxSec)}s linear forwards`
                    : undefined,
                }}
              />
            </div>
          </div>
        )}
        {needsClick && (
          <button
            type="button"
            onClick={() => {
              if (audio.current) void audio.current.play().catch(() => {});
              else player.current?.playVideo();
              setNeedsClick(false);
            }}
            className="absolute inset-0 grid place-items-center bg-black/60 text-lg font-bold text-white"
          >
            คลิกเพื่อเปิดเสียง
          </button>
        )}
      </div>
      {current && (
        <div
          className="mt-3 rounded-2xl border-2 bg-[#120c16]/90 px-5 py-3 text-white shadow-2xl"
          style={{ borderColor: color }}
        >
          <p className="text-base font-semibold" style={{ color }}>
            {current.test
              ? "ทดสอบ"
              : current.kind === "voice"
                ? `ฝากเสียงจาก ${current.fan} · ฿${current.amount.toLocaleString("th-TH")}`
                : `ขอโดย ${current.fan} · ฿${current.amount.toLocaleString("th-TH")}`}
          </p>
          <p className="truncate text-xl font-extrabold leading-tight">
            {current.kind === "voice"
              ? current.test
                ? "ทดสอบเสียง"
                : "ฝากเสียง"
              : current.title || (current.test ? "คลิปทดสอบ" : "คลิป YouTube")}
          </p>
        </div>
      )}
    </div>
  );
}

function stopAudio(ref: { current: HTMLAudioElement | null }) {
  const el = ref.current;
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
  ref.current = null;
}
