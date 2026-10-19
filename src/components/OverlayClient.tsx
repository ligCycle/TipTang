"use client";

import { useEffect, useRef, useState } from "react";
import { Confetti } from "./Confetti";
import { AlertCard } from "@/components/overlay/AlertCard";
import { pickTier, resolveAlert, type AlertBase, type AlertTier } from "@/lib/alert-tiers";
import type { TestAlert } from "@/lib/overlay-test";

type Alert = {
  id: string;
  name: string;
  amount: number;
  message: string | null;
  /** Seconds the tip moved the subathon clock (negative = sabotage); null = none. */
  timerDelta?: number | null;
};

/** One tip as the overlay feeds return it. */
export type FeedTip = {
  id: string;
  supporterName: string;
  message: string | null;
  amount: number;
  confirmedAt: string | null;
  timerDelta: number | null;
};

const BASE_DURATION_SEC = 7;

export function OverlayClient({
  username,
  apiKey,
  test,
  soundUrl,
  imageUrl,
  videoUrl,
  color,
  ttsEnabled,
  librarySounds,
  libraryStickers,
  libraryVideos = [],
  alertStyle,
  alertTheme,
  bigTipThreshold,
  tiers = [],
}: {
  username: string;
  apiKey: string;
  test: boolean;
  soundUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  color: string | null;
  ttsEnabled: boolean;
  librarySounds: string[];
  libraryStickers: string[];
  /** Library videos — only alert tiers use them (never random-picked). */
  libraryVideos?: string[];
  alertStyle: string;
  alertTheme: string;
  bigTipThreshold: number;
  tiers?: AlertTier[];
}) {
  const [current, setCurrent] = useState<Alert | null>(null);
  // Sound/visual/duration chosen for the current alert (library random + tier).
  const [media, setMedia] = useState<AlertBase | null>(null);
  const queue = useRef<Alert[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const lastSeen = useRef<string>(new Date().toISOString());
  const showing = useRef(false);
  const libraryUrls = useRef(new Set([...librarySounds, ...libraryStickers, ...libraryVideos]));

  function pickRandom(arr: string[]): string | null {
    return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  }

  // Sequentially preload library assets so a randomly-picked one plays instantly
  // (one at a time to avoid a network/RAM spike when OBS opens the overlay).
  useEffect(() => {
    const items = [
      ...libraryStickers.map((u) => ({ u, img: true })),
      ...librarySounds.map((u) => ({ u, img: false })),
    ];
    let i = 0;
    let cancelled = false;
    function loadNext() {
      if (cancelled || i >= items.length) return;
      const { u, img } = items[i++];
      if (img) {
        const el = new Image();
        el.onload = el.onerror = loadNext;
        el.src = u;
      } else {
        const a = new Audio();
        a.preload = "auto";
        a.oncanplaythrough = a.onerror = loadNext;
        a.src = u;
        a.load();
      }
    }
    loadNext();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Read the supporter's name + amount + message aloud via the TTS proxy.
  function speak(a: Alert) {
    if (!ttsEnabled) return;
    const parts = [a.name || "ผู้ไม่ประสงค์ออกนาม", "ทิป", String(a.amount), "บาท"];
    if (a.message) parts.push(a.message);
    const text = parts.join(" ").slice(0, 200);
    try {
      // The proxy only speaks for a valid overlay key (or a logged-in creator).
      const tts = new Audio(
        `/api/tts?lang=th&u=${encodeURIComponent(username)}&key=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(text)}`,
      );
      tts.play().catch(() => {});
    } catch {
      // ignore
    }
  }

  function pump() {
    if (showing.current) return;
    const next = queue.current.shift();
    if (!next) return;
    showing.current = true;
    setCurrent(next);
    // Random pick from the library each alert (fall back to the single asset),
    // then the amount's tier overrides whatever it sets.
    const chosen = resolveAlert(
      {
        soundUrl: pickRandom(librarySounds) ?? soundUrl,
        imageUrl: pickRandom(libraryStickers) ?? imageUrl,
        videoUrl,
        durationSec: BASE_DURATION_SEC,
      },
      pickTier(tiers, Number(next.amount)),
      libraryUrls.current,
    );
    setMedia(chosen);
    // Video carries its own audio; only play the separate sound / TTS when no
    // video. TTS follows the alert sound so they don't overlap.
    if (chosen.soundUrl && !chosen.videoUrl) {
      // OBS browser sources allow autoplay; normal browsers may block until a
      // user gesture (fine — the overlay runs inside OBS in real use).
      try {
        const audio = new Audio(chosen.soundUrl);
        if (ttsEnabled) {
          audio.addEventListener("ended", () => speak(next), { once: true });
        }
        audio.play().catch(() => {
          if (ttsEnabled) speak(next);
        });
      } catch {
        if (ttsEnabled) speak(next);
      }
    } else if (!chosen.videoUrl) {
      speak(next);
    }
    setTimeout(() => {
      setCurrent(null);
      setMedia(null);
      showing.current = false;
      setTimeout(pump, 600); // small gap before the next alert
    }, chosen.durationSec * 1000);
  }

  function enqueue(a: Alert) {
    if (seen.current.has(a.id)) return;
    seen.current.add(a.id);
    queue.current.push(a);
    pump();
  }

  function take(tips: FeedTip[], t: TestAlert | null) {
    for (const tip of tips) {
      enqueue({
        id: tip.id,
        name: tip.supporterName,
        amount: tip.amount,
        message: tip.message,
        timerDelta: tip.timerDelta ?? null,
      });
    }
    // A test from the dashboard: shown once per id, never moves the timer.
    if (t) enqueue({ id: t.id, name: t.name, amount: t.amount, message: t.message, timerDelta: null });
  }

  useEffect(() => {
    let testIv: ReturnType<typeof setInterval> | undefined;
    if (test) {
      let n = 0;
      const fire = () => {
        // Alternate a normal (฿100) and a big (฿1,000) tip so both the regular
        // and the big-tip celebration can be previewed on one page.
        const big = n % 2 === 1;
        enqueue({
          id: `test-${n++}`,
          name: "ผู้สนับสนุนตัวอย่าง",
          amount: big ? 1000 : 100,
          message: "ทดสอบ Donation Alert",
          // Preview both directions of the subathon badge too.
          timerDelta: big ? -300 : 120,
        });
      };
      fire();
      // Loop the preview so the creator can watch the effect repeatedly
      // without pressing "Test" again (each alert shows ~7.6s).
      testIv = setInterval(fire, 8000);
    }
    // In test mode show ONLY the looping sample alerts — don't also poll real
    // confirmed tips (they'd appear with unexpected amounts mixed into the
    // preview).
    if (test || !apiKey) {
      return () => {
        if (testIv) clearInterval(testIv);
      };
    }

    let active = true;
    async function poll() {
      try {
        const res = await fetch(
          `/api/overlay/${username}?key=${encodeURIComponent(apiKey)}&after=${encodeURIComponent(lastSeen.current)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        // The server's cursor also jumps forward while alerts are switched off,
        // so tips from that time never replay when they come back on.
        if (typeof data.cursor === "string" && data.cursor > lastSeen.current) {
          lastSeen.current = data.cursor;
        }
        take(data.tips ?? [], data.test ?? null);
      } catch {
        // ignore transient network errors
      }
    }

    const iv = setInterval(() => {
      if (active) poll();
    }, 3000);
    return () => {
      active = false;
      clearInterval(iv);
      if (testIv) clearInterval(testIv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Big-tip celebration: threshold is an Int, amount may arrive as a decimal /
  // string — coerce before comparing.
  const isBig =
    bigTipThreshold > 0 &&
    current != null &&
    Number(current.amount) >= bigTipThreshold;

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {current && media && (
        // Centering wrapper: absolute left-1/2 + translateX(-50%) pins the card
        // to the viewport centre regardless of document width / siblings /
        // scroll. The inner card runs the entrance animation (its own transform),
        // so the two never conflict.
        <div
          className={`absolute left-1/2 top-6 w-[calc(100%-2rem)] -translate-x-1/2 ${isBig ? "max-w-[34rem]" : "max-w-md"}`}
        >
          <AlertCard
            key={current.id}
            name={current.name}
            amount={current.amount}
            message={current.message}
            timerDelta={current.timerDelta}
            color={color}
            alertStyle={alertStyle}
            alertTheme={alertTheme}
            isBig={isBig}
            imageUrl={media.videoUrl ? null : media.imageUrl}
            videoUrl={media.videoUrl}
          />
        </div>
      )}
      {/* Confetti is a SIBLING of the card (card clips overflow) — fixed + high
          z so pieces spread across the whole OBS canvas. Keyed to replay. */}
      {current && isBig && <Confetti key={current.id} />}
    </div>
  );
}
