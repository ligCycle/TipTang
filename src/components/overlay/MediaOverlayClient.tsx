"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_COLOR } from "@/lib/colors";
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
 * The "ขอคลิป/เพลง" OBS link. The server owns the queue: this plays whatever
 * it hands out (seeking past what already played after a refresh) and reports
 * started / ended / error. Problems that belong to this source only (player
 * errors 2/5/153, a browser tab blocking autoplay) are never reported, so a
 * broken preview can't skip the clip for the real OBS source.
 */
export function MediaOverlayClient({ username, apiKey }: { username: string; apiKey: string }) {
  const [feed, setFeed] = useState<MediaFeed | null>(null);
  const [needsClick, setNeedsClick] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
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
  const maxSec = feed?.maxSec ?? 180;

  useEffect(() => {
    player.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if ((current?.id ?? null) === loadedId.current) return;
    const clearTimers = () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    };
    clearTimers();
    player.current?.destroy();
    player.current = null;
    loadedId.current = current?.id ?? null;
    setNeedsClick(false);
    if (!current || !box.current) return;

    const clip = current;
    const report = (event: "started" | "ended" | "error") =>
      fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: clip.id, event }) }).catch(() => {});
    let started = false;
    let retried = false;
    let sourceBroken = false;

    const create = async () => {
      // The IFrame API sends this page's address to YouTube (forigin): take
      // the overlay key out of it first. OBS reloads its saved link, so it
      // keeps working; the key stays in memory for the feed calls.
      if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
      const YT = await loadYouTube();
      if (loadedId.current !== clip.id || !box.current) return;
      box.current.replaceChildren();
      const el = document.createElement("div");
      box.current.appendChild(el);
      const startAt = clip.startSec + clip.elapsedSec;
      player.current = new YT.Player(el, {
        host: "https://www.youtube-nocookie.com",
        videoId: clip.videoId,
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
            player.current?.setVolume(volume);
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
    // Never started (premiere, blocked in this region, endless ad): move on —
    // unless the problem is this source (broken player, blocked autoplay).
    timers.current.push(
      setTimeout(() => {
        if (!started && !sourceBroken && (window.obsstudio || !needsClickRef.current)) void report("error");
      }, WATCHDOG_MS),
    );
    return undefined;
  }, [current, url, maxSec, volume]);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
      player.current?.destroy();
    },
    [],
  );

  const color = feed?.color && /^#[0-9a-fA-F]{6}$/.test(feed.color) ? feed.color : DEFAULT_COLOR;

  return (
    <div className={`mx-auto w-[640px] ${current ? "" : "invisible"}`}>
      <div className="relative h-[360px] w-[640px] overflow-hidden rounded-2xl bg-black">
        <div ref={box} className="h-full w-full" />
        {needsClick && (
          <button
            type="button"
            onClick={() => {
              player.current?.playVideo();
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
            {current.test ? "ทดสอบ" : `ขอโดย ${current.fan} · ฿${current.amount.toLocaleString("th-TH")}`}
          </p>
          <p className="truncate text-xl font-extrabold leading-tight">{current.title}</p>
        </div>
      )}
    </div>
  );
}
