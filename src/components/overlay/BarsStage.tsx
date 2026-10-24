"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GoalOverlayClient } from "@/components/GoalOverlayClient";
import { TimerOverlayClient } from "@/components/TimerOverlayClient";
import { ComboOverlayClient } from "@/components/overlay/ComboOverlayClient";
import { PkOverlayClient } from "@/components/overlay/PkOverlayClient";
import { BossOverlayClient } from "@/components/overlay/BossOverlayClient";
import { ObsSetupHint } from "@/components/overlay/ObsSetupHint";

/** The poll only marks the link "connected"; every bar is always mounted (C10). */
const STAGE_POLL_MS = 20_000;
const WIDTH = 800;

function subscribeResize(fn: () => void) {
  window.addEventListener("resize", fn);
  return () => window.removeEventListener("resize", fn);
}
const windowSize = () => `${window.innerWidth}x${window.innerHeight}`;

/**
 * The bars OBS link: goal, timer, combo, PK and boss stacked top to bottom.
 * Each hides itself when there's nothing to show (card off, no combo or
 * match running, empty boss list). The column is scaled down to fit the
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

  useEffect(() => {
    const ping = () =>
      fetch(`/api/overlay/${username}/stage?key=${encodeURIComponent(apiKey)}&link=bars`, { cache: "no-store" }).catch(() => {});
    void ping();
    const id = setInterval(ping, STAGE_POLL_MS);
    return () => clearInterval(id);
  }, [username, apiKey]);

  const scale = vw > 0 && vh > 0 ? Math.min(1, vw / WIDTH, height > 0 ? vh / height : 1) : 1;
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <ObsSetupHint label="ลิงก์แถบ" place="bottom" />
      <div
        ref={column}
        className="absolute left-1/2 top-0 flex flex-col gap-2"
        style={{ width: WIDTH, transform: `translateX(-50%) scale(${scale})`, transformOrigin: "top center" }}
      >
        <GoalOverlayClient username={username} apiKey={apiKey} color={colors.goal} />
        <TimerOverlayClient username={username} apiKey={apiKey} color={colors.timer} />
        <ComboOverlayClient username={username} apiKey={apiKey} color={colors.combo} />
        <PkOverlayClient username={username} apiKey={apiKey} />
        <BossOverlayClient username={username} apiKey={apiKey} color={colors.boss} via="bars" />
      </div>
    </div>
  );
}
