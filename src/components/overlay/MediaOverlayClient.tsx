"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_COLOR } from "@/lib/colors";
import { Icon } from "@/components/Icon";
import type { MediaFeed } from "@/lib/media-queue";
import { useStage } from "@/components/overlay/Stage";
import { IDLE_POLL_MS, useLinkFeed } from "@/components/overlay/LinkFeed";

const POLL_MS = 3000;
/** A clip that hasn't started playing by then can't play here: next one. */
const WATCHDOG_MS = 20_000;
/** A normal browser tab blocks sound autoplay; offer a click after this. */
const AUTOPLAY_CHECK_MS = 2000;

// The bits of the YouTube IFrame API used here.
type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
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
 * On the main link (via=main) it plays only while the stage is free: a popup
 * pauses it (reported, so that time doesn't count) and it resumes after; with
 * the stage busy nothing new starts (C1).
 */
export function MediaOverlayClient({ username, apiKey, via = null }: { username: string; apiKey: string; via?: "main" | null }) {
  const [feed, setFeed] = useState<MediaFeed | null>(null);
  const stage = useStage();
  const linkFeed = useLinkFeed();
  const busyRef = useRef(stage.busy);
  // Pause / resume of whatever is loaded (set by the load effect below).
  const control = useRef<{ pause(): void; resume(): void; dispose(): void } | null>(null);
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
        // hold=1: the stage is busy, so nothing new may start (its clock would run).
        const q = via === "main" ? `&via=main${busyRef.current ? "&hold=1" : ""}` : "";
        const res = await fetch(url + q, { cache: "no-store" });
        if (res.ok && active) setFeed((await res.json()) as MediaFeed);
      } catch {
        // Network blip: try again next tick.
      }
    }
    void poll();
    // Main link: ask while its poll says something plays or waits, once more
    // when that stops (so a finished clip clears), and now and then anyway.
    const id = setInterval(poll, linkFeed ? IDLE_POLL_MS : POLL_MS);
    let wasHot = false;
    const offHot = linkFeed?.on("hot", (h) => {
      const hot = Boolean((h as { media?: boolean } | null)?.media);
      if (hot || wasHot) void poll();
      wasHot = hot;
    });
    return () => {
      active = false;
      clearInterval(id);
      offHot?.();
    };
  }, [url, via, linkFeed]);

  const current = feed?.current ?? null;
  // A popup took the stage: pause; it's free again: resume.
  useEffect(() => {
    busyRef.current = stage.busy;
    if (stage.busy) control.current?.pause();
    else control.current?.resume();
  }, [stage.busy]);
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
    control.current?.dispose();
    control.current = null;
    restoreKey();
    setVoiceStart(null);
    loadedId.current = current?.id ?? null;
    setNeedsClick(false);
    if (!current || !box.current) return;

    const clip = current;
    const maxSec = clip.maxSec;
    // One after another, so a quick pause/resume can't arrive the wrong way round (I-2).
    let chain: Promise<unknown> = Promise.resolve();
    const report = (event: "started" | "ended" | "error" | "paused" | "resumed", keepalive = false) =>
      (chain = chain.then(() =>
        fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: clip.id, event }),
          keepalive,
        }).catch(() => {}),
      ));
    let started = false;
    let retried = false;
    let sourceBroken = false;
    // Paused behind a popup on the main link: timers stop with it (C1).
    let paused = false;
    // Never started (premiere, blocked in this region, endless ad): move on —
    // unless the problem is this source (broken player, blocked autoplay).
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const armWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      if (paused) return;
      watchdog = setTimeout(() => {
        if (!started && !sourceBroken && (window.obsstudio || !needsClickRef.current)) void report("error");
      }, WATCHDOG_MS);
      timers.current.push(watchdog);
    };
    const holdWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = null;
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
        // Signing failed for a moment: ask again on the next poll (never burn
        // the fan's voice on a storage hiccup).
        loadedId.current = null;
        return;
      }
      const el = new Audio(clip.audioUrl);
      el.preload = "auto";
      el.volume = volumeRef.current / 100;
      audio.current = el;
      // The player enforces the 30 s limit itself (recorder files carry no
      // reliable duration); time paused behind a popup doesn't count.
      let leftMs = maxSec * 1000;
      let armedAt = 0;
      let limit: ReturnType<typeof setTimeout> | null = null;
      const armLimit = () => {
        armedAt = Date.now();
        limit = setTimeout(() => {
          stopAudio(audio);
          void report("ended");
        }, leftMs);
        timers.current.push(limit);
      };
      control.current = {
        pause() {
          if (paused) return;
          paused = true;
          holdWatchdog();
          if (limit) {
            clearTimeout(limit);
            limit = null;
            leftMs = Math.max(0, leftMs - (Date.now() - armedAt));
          }
          el.pause();
          void report("paused");
        },
        resume() {
          if (!paused) return;
          paused = false;
          void report("resumed");
          if (started) armLimit();
          else armWatchdog();
          void el.play().catch(() => {});
        },
        // Gone while paused (skipped, OBS closed): never leave the pause open (I-2).
        dispose() {
          if (paused) void report("resumed", true);
        },
      };
      armWatchdog();
      const begin = () => {
        if (started) return;
        started = true;
        setNeedsClick(false);
        setVoiceStart(Date.now());
        void report("started");
        if (!paused) armLimit();
      };
      el.addEventListener("playing", begin);
      el.addEventListener("ended", () => {
        if (started) void report("ended");
      });
      // Only the real OBS source may give up on a voice (and only after one
      // retry): a preview tab that can't decode it must not use it up for
      // everyone. Otherwise the watchdog / server time limit moves on.
      let audioRetried = false;
      el.addEventListener("error", () => {
        if (started) return;
        if (!window.obsstudio) {
          sourceBroken = true;
          return;
        }
        if (!audioRetried) {
          audioRetried = true;
          el.load();
          void el.play().catch(() => {});
          return;
        }
        void report("error");
      });
      // Handed out while a popup holds the stage: wait for it.
      if (busyRef.current) {
        control.current.pause();
        return undefined;
      }
      el.play().catch((e: unknown) => {
        // A normal browser tab blocks sound until a click; OBS doesn't. A
        // play cut short because this voice was skipped is not that.
        if (audio.current !== el || (e instanceof DOMException && e.name === "AbortError")) return;
        if (!window.obsstudio) setNeedsClick(true);
      });
      return undefined;
    }

    control.current = {
      pause() {
        if (paused) return;
        paused = true;
        holdWatchdog();
        if (ready.current) player.current?.pauseVideo();
        void report("paused");
      },
      resume() {
        if (!paused) return;
        paused = false;
        void report("resumed");
        if (!started) armWatchdog();
        if (ready.current) player.current?.playVideo();
      },
      // Gone while paused (skipped, OBS closed): never leave the pause open (I-2).
      dispose() {
        if (paused) void report("resumed", true);
      },
    };
    if (busyRef.current) control.current.pause();

    const create = async () => {
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
      // The IFrame API sends this page's address to YouTube (forigin): take
      // the overlay key out of it while the player is made, and put it back
      // once it's ready, so a refresh of this link still works (C6). The key
      // stays in memory for the feed calls.
      if (pageQuery === null) pageQuery = window.location.search;
      if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
      // Back on ready, on an error, or after 10 s whatever happens (I-3).
      timers.current.push(setTimeout(restoreKey, 10_000));
      player.current = new YT.Player(el, {
        host: "https://www.youtube-nocookie.com",
        videoId: clip.videoId ?? "",
        width: "640",
        height: "360",
        playerVars: {
          autoplay: paused ? 0 : 1,
          controls: 0,
          rel: 0,
          playsinline: 1,
          start: startAt,
          end: clip.startSec + maxSec,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            restoreKey();
            ready.current = true;
            player.current?.setVolume(volumeRef.current);
            if (paused) return;
            player.current?.playVideo();
            timers.current.push(
              setTimeout(() => {
                // OBS plays sound without a click; a normal browser tab doesn't.
                if (!started && !window.obsstudio) setNeedsClick(true);
              }, AUTOPLAY_CHECK_MS),
            );
          },
          onStateChange: (e) => {
            // Started by itself while a popup holds the stage: wait.
            if (e.data === PLAYING && paused) player.current?.pauseVideo();
            if (e.data === PLAYING && !started) {
              started = true;
              setNeedsClick(false);
              void report("started");
            } else if (e.data === ENDED && started) {
              void report("ended");
            }
          },
          onError: (e) => {
            restoreKey();
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
      control.current?.dispose();
      restoreKey();
    },
    [],
  );

  const color = feed?.color && /^#[0-9a-fA-F]{6}$/.test(feed.color) ? feed.color : DEFAULT_COLOR;

  // On the main link it's hidden (never unmounted) while a popup has the stage.
  const hidden = !current || (stage.embedded && stage.busy);
  return (
    <div className={`mx-auto w-[640px] ${hidden ? "invisible" : ""}`}>
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
                  animationPlayState: stage.embedded && stage.busy ? "paused" : "running",
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
      {current && <MediaInfoCard current={current} color={color} />}
    </div>
  );
}

/** "ขอโดย <fan> · ฿N" under a clip or voice message (the OBS link and the settings preview). */
export function MediaInfoCard({
  current,
  color,
}: {
  current: { test: boolean; kind: "clip" | "voice"; fan: string; amount: number; title: string | null };
  color: string;
}) {
  return (
    <div className="mt-3 rounded-2xl border-2 bg-[#120c16]/90 px-5 py-3 text-white shadow-2xl" style={{ borderColor: color }}>
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
  );
}

/** The page's own query (the overlay key), kept for putting back after the player is made. */
let pageQuery: string | null = null;
function restoreKey() {
  if (pageQuery && !window.location.search) window.history.replaceState(null, "", window.location.pathname + pageQuery);
}

function stopAudio(ref: { current: HTMLAudioElement | null }) {
  const el = ref.current;
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
  ref.current = null;
}
