"use client";

import { useEffect, useRef, useState } from "react";
import { Confetti } from "./Confetti";
import { AlertCard } from "@/components/overlay/AlertCard";
import { useStage } from "@/components/overlay/Stage";
import { useLinkFeed } from "@/components/overlay/LinkFeed";
import { pickTier, resolveAlert, celebrates, pickNormal, type AlertBase, type AlertTier } from "@/lib/alert-tiers";
import { poolsForAmount, applyPick, type NormalMedia } from "@/lib/alert-sets";
import type { TestAlert } from "@/lib/overlay-test";

type Alert = {
  id: string;
  name: string;
  amount: number;
  message: string | null;
  /** Seconds the tip moved the subathon clock (negative = sabotage); null = none. */
  timerDelta?: number | null;
  /** The sound the fan picked (beats tier and set); null = none. */
  soundUrl?: string | null;
  comboLevel?: number | null;
  wishName?: string | null;
};

/** One tip as the overlay feeds return it. */
export type FeedTip = {
  id: string;
  supporterName: string;
  message: string | null;
  amount: number;
  confirmedAt: string | null;
  timerDelta: number | null;
  /** The sound the fan picked; null if none or the file is gone. */
  soundUrl: string | null;
  /** Combo tip level after this tip; null when it wasn't part of a combo. */
  comboLevel: number | null;
  /** Goal item the fan chose to help; null = none. */
  wishName: string | null;
};

const BASE_DURATION_SEC = 7;
/** Combo level from which alerts get the big celebration (the card adds a shake from level 5). */
const COMBO_BIG_LEVEL = 3;
/** On the main link an alert holds the stage at most this long, read-aloud included. */
const MAX_TURN_MS = 30_000;

export function OverlayClient({
  username,
  apiKey,
  test,
  color,
  ttsEnabled,
  normal,
  mediaVersion,
  libraryAll,
  alertStyle,
  alertTheme,
  tiers = [],
}: {
  username: string;
  apiKey: string;
  test: boolean;
  color: string | null;
  ttsEnabled: boolean;
  /** The active sound set's media (random pick each alert, sounds by amount). */
  normal: NormalMedia;
  /** Version of `normal`; the feed sends new media when the set changes. */
  mediaVersion: string;
  /** Every library file — what a tier may use. */
  libraryAll: string[];
  alertStyle: string;
  alertTheme: string;
  tiers?: AlertTier[];
}) {
  const [current, setCurrent] = useState<Alert | null>(null);
  // Sound/visual/duration chosen for the current alert (library random + tier).
  const [media, setMedia] = useState<(AlertBase & { videoMuted: boolean }) | null>(null);
  const queue = useRef<Alert[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const lastSeen = useRef<string>(new Date().toISOString());
  const showing = useRef(false);
  const libraryUrls = useRef(new Set(libraryAll));
  // The main link's stage (always free on a page of its own).
  const stage = useStage();
  const linkFeed = useLinkFeed();
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  // Swapped in place when the creator switches or edits the active set.
  const normalRef = useRef(normal);
  const versionRef = useRef(mediaVersion);

  // Sequentially preload library assets so a randomly-picked one plays instantly
  // (one at a time to avoid a network/RAM spike when OBS opens the overlay).
  useEffect(() => {
    const items = [
      ...normal.images.map((u) => ({ u, img: true })),
      ...normal.sounds.map((s) => ({ u: s.url, img: false })),
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
  // `done` runs when it has finished (or won't play), so the main link's stage
  // isn't handed on mid-sentence.
  function speak(a: Alert, done: () => void = () => {}) {
    if (!ttsEnabled) return done();
    const parts = [a.name || "ผู้ไม่ประสงค์ออกนาม", "ทิป", String(a.amount), "บาท"];
    if (a.message) parts.push(a.message);
    const text = parts.join(" ").slice(0, 200);
    try {
      // The proxy only speaks for a valid overlay key (or a logged-in creator).
      const tts = new Audio(
        `/api/tts?lang=th&u=${encodeURIComponent(username)}&key=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(text)}`,
      );
      tts.addEventListener("ended", done, { once: true });
      tts.addEventListener("error", done, { once: true });
      tts.play().catch(done);
    } catch {
      done();
    }
  }

  async function pump() {
    if (showing.current) return;
    const next = queue.current.shift();
    if (!next) return;
    showing.current = true;
    // On the main link alerts take turns with the other popups (alerts first, C8).
    await stageRef.current.acquire("alert");
    let ttsDone: () => void = () => {};
    const ttsFinished = new Promise<void>((r) => (ttsDone = r));
    setCurrent(next);
    // Random pick from the files switched on for normal alerts, then the
    // amount's tier overrides whatever it sets.
    const amount = Number(next.amount);
    const chosen = applyPick(
      resolveAlert(
        { ...pickNormal(poolsForAmount(normalRef.current, amount)), durationSec: BASE_DURATION_SEC },
        pickTier(tiers, amount),
        libraryUrls.current,
      ),
      next.soundUrl ?? null,
    );
    setMedia(chosen);
    // Video carries its own audio; only play the separate sound / TTS when no
    // video. TTS follows the alert sound so they don't overlap.
    // A fan's picked sound plays over a (muted) video too.
    if (chosen.soundUrl && (!chosen.videoUrl || chosen.videoMuted)) {
      // OBS browser sources allow autoplay; normal browsers may block until a
      // user gesture (fine — the overlay runs inside OBS in real use).
      try {
        const audio = new Audio(chosen.soundUrl);
        if (ttsEnabled) {
          audio.addEventListener("ended", () => speak(next, ttsDone), { once: true });
        } else ttsDone();
        audio.play().catch(() => {
          if (ttsEnabled) speak(next, ttsDone);
        });
      } catch {
        speak(next, ttsDone);
      }
    } else if (!chosen.videoUrl) {
      speak(next, ttsDone);
    } else ttsDone();
    setTimeout(() => {
      setCurrent(null);
      setMedia(null);
      const handOn = () => {
        stageRef.current.release();
        showing.current = false;
        setTimeout(pump, 600); // small gap before the next alert
      };
      // Own link: as before. Main link: the turn ends once the read-aloud has
      // too, at most 30 s after the alert began (C7).
      if (!stageRef.current.embedded) return handOn();
      const capMs = Math.max(0, MAX_TURN_MS - chosen.durationSec * 1000);
      void Promise.race([ttsFinished, new Promise<void>((r) => setTimeout(r, capMs))]).then(handOn);
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
        soundUrl: tip.soundUrl ?? null,
        comboLevel: tip.comboLevel ?? null,
        wishName: tip.wishName ?? null,
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
    const cursorQuery = () => `after=${encodeURIComponent(lastSeen.current)}&v=${encodeURIComponent(versionRef.current)}`;
    function apply(raw: unknown) {
      const data = raw as { tips?: FeedTip[]; test?: TestAlert | null; cursor?: string; media?: { version: string; normal: NormalMedia } } | null;
      if (!data) return;
      // The server's cursor also jumps forward while alerts are switched off,
      // so tips from that time never replay when they come back on.
      if (data.media && typeof data.media.version === "string") {
        normalRef.current = data.media.normal;
        versionRef.current = data.media.version;
      }
      if (typeof data.cursor === "string" && data.cursor > lastSeen.current) {
        lastSeen.current = data.cursor;
      }
      take(data.tips ?? [], data.test ?? null);
    }

    // Main link: the alerts ride on the link's one poll (src/components/overlay/LinkFeed.tsx).
    if (linkFeed) {
      const offQuery = linkFeed.addQuery(cursorQuery);
      const offAlerts = linkFeed.on("alerts", apply);
      return () => {
        active = false;
        offQuery();
        offAlerts();
        if (testIv) clearInterval(testIv);
      };
    }

    async function poll() {
      try {
        const res = await fetch(`/api/overlay/${username}?key=${encodeURIComponent(apiKey)}&${cursorQuery()}`);
        if (!res.ok) return;
        apply(await res.json());
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

  // Big celebration when the amount's tier says so (amount may arrive as a
  // decimal / string — coerce before comparing).
  // A combo at level 3+ also gets the big celebration.
  const isBig =
    current != null && (celebrates(tiers, Number(current.amount)) || (current.comboLevel ?? 0) >= COMBO_BIG_LEVEL);

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
            videoMuted={media.videoMuted}
            comboLevel={current.comboLevel ?? null}
            wishName={current.wishName ?? null}
          />
        </div>
      )}
      {/* Confetti is a SIBLING of the card (card clips overflow) — fixed + high
          z so pieces spread across the whole OBS canvas. Keyed to replay. */}
      {current && isBig && <Confetti key={current.id} />}
    </div>
  );
}
