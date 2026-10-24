"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GoalOverlayClient } from "@/components/GoalOverlayClient";
import { TimerOverlayClient } from "@/components/TimerOverlayClient";
import { ComboOverlayClient } from "@/components/overlay/ComboOverlayClient";
import { PkOverlayClient } from "@/components/overlay/PkOverlayClient";
import { BossOverlayClient } from "@/components/overlay/BossOverlayClient";
import { ObsSetupHint } from "@/components/overlay/ObsSetupHint";
import type { BarCard } from "@/lib/obs-stage";

/**
 * The stage poll marks the link "connected" and says which bars to mount:
 * every bar except one whose own link is open (that link shows it).
 */
const STAGE_POLL_MS = 10_000;
const NO_BARS: Record<BarCard, boolean> = { goal: false, timer: false, combo: false, pk: false, boss: false };
/** Every bar is drawn this wide, so the stack reads as one neat column. */
const WIDTH = 576;
/*
 * Inside the bars link each bar fills the column: their own outer padding is
 * dropped (the column gap spaces them), width caps are lifted and the timer
 * card stretches like the others. The per-feature links keep their own look.
 */
const BARS_CSS = `
.tt-bars > * { width: 100%; padding: 0 !important; margin: 0 !important; }
.tt-bars [class*="max-w-"] { max-width: none !important; }
.tt-bars .inline-block { display: block; }
.tt-bars .mx-auto { margin-left: 0; margin-right: 0; }
`;

function subscribeResize(fn: () => void) {
  window.addEventListener("resize", fn);
  return () => window.removeEventListener("resize", fn);
}
const windowSize = () => `${window.innerWidth}x${window.innerHeight}`;

/**
 * The bars OBS link: goal, timer, combo, PK and boss stacked top to bottom.
 * Each hides itself when there's nothing to show (card off, no combo or
 * match running, empty boss list). The column is scaled to fill the
 * creator's source by width and height (C9).
 */
export function BarsStage({
  username,
  apiKey,
  colors,
}: {
  username: string;
  apiKey: string;
  colors: { goal: string | null; timer: string | null; combo: string | null; boss: string | null };
}) {
  const column = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const size = useSyncExternalStore(subscribeResize, windowSize, () => "0x0");
  const [vw, vh] = size.split("x").map(Number);

  useEffect(() => {
    const el = column.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [cards, setCards] = useState<Record<BarCard, boolean> | null>(null);
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/overlay/${username}/stage?key=${encodeURIComponent(apiKey)}&link=bars`, { cache: "no-store" });
        const d = res.ok ? ((await res.json()) as { cards: Record<BarCard, boolean> | null }) : null;
        const next = d?.cards ?? null;
        if (!active || !next) return;
        setCards((cur) => (cur && (Object.keys(next) as BarCard[]).every((k) => cur[k] === next[k]) ? cur : next));
      } catch {
        // keep what's shown; try again next tick
      }
    };
    void poll();
    const id = setInterval(poll, STAGE_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [username, apiKey]);
  // Until the first answer: nothing (a bar placed on its own link must not flash here).
  const show = cards ?? NO_BARS;

  // Fill the source’s width (up to 2×), unless the stack would then be taller than the source.
  const scale = vw > 0 && vh > 0 ? Math.min(2, vw / WIDTH, height > 0 ? vh / height : 2) : 1;
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <ObsSetupHint label="ลิงก์แถบ" place="bottom" />
      <div
        ref={column}
        className="tt-bars absolute left-1/2 top-2 flex flex-col gap-3"
        style={{ width: WIDTH, transform: `translateX(-50%) scale(${scale})`, transformOrigin: "top center" }}
      >
        {show.goal && <GoalOverlayClient username={username} apiKey={apiKey} color={colors.goal} via="bars" />}
        {show.timer && <TimerOverlayClient username={username} apiKey={apiKey} color={colors.timer} via="bars" />}
        {show.combo && <ComboOverlayClient username={username} apiKey={apiKey} color={colors.combo} via="bars" />}
        {show.pk && <PkOverlayClient username={username} apiKey={apiKey} via="bars" />}
        {show.boss && <BossOverlayClient username={username} apiKey={apiKey} color={colors.boss} via="bars" />}
      </div>
      <style>{BARS_CSS}</style>
    </div>
  );
}
