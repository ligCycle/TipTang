"use client";

import { useEffect, useRef, useState } from "react";
import { OverlayClient, type FeedTip } from "@/components/OverlayClient";
import { GoalView, type GoalState } from "@/components/overlay/GoalView";
import { TimerView, type TimerState } from "@/components/overlay/TimerView";
import { anchorClasses, type Anchor } from "@/lib/overlay-layout";
import type { AlertTier } from "@/lib/alert-tiers";
import type { TestAlert } from "@/lib/overlay-test";

type AlertProps = Omit<
  React.ComponentProps<typeof OverlayClient>,
  "feed" | "positionClass" | "test" | "username" | "apiKey"
>;

/**
 * The single OBS link: a 1920x1080 stage showing every enabled feature at
 * its anchor, fed by ONE poll of /api/overlay/[username]/state. Alerts sit in
 * the top layer so a widget placed in the same spot never covers them.
 */
export function LiveOverlay({
  username,
  apiKey,
  alert,
  tiers,
  positions,
  goalColor,
  timerColor,
}: {
  username: string;
  apiKey: string;
  alert: AlertProps;
  tiers: AlertTier[];
  positions: { alert: Anchor; goal: Anchor; timer: Anchor };
  goalColor: string | null;
  timerColor: string | null;
}) {
  const [feed, setFeed] = useState<{ tips: FeedTip[]; test: TestAlert | null } | null>(null);
  const [goal, setGoal] = useState<GoalState | null>(null);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const cursor = useRef<string>(new Date().toISOString());

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch(
          `/api/overlay/${username}/state?key=${encodeURIComponent(apiKey)}&after=${encodeURIComponent(cursor.current)}`,
        );
        if (!res.ok || !active) return;
        const d = await res.json();
        if (typeof d.cursor === "string" && d.cursor > cursor.current) cursor.current = d.cursor;
        setFeed({ tips: d.tips ?? [], test: d.test ?? null });
        setGoal(d.goal ?? null);
        setTimer(d.timer ?? null);
      } catch {
        // ignore transient network errors
      }
    }
    poll();
    const iv = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(iv);
    };
  }, [username, apiKey]);

  return (
    <div className="pointer-events-none relative h-[1080px] w-[1920px] overflow-hidden">
      <div className={`absolute z-10 w-[36rem] ${anchorClasses(positions.goal)}`}>
        <GoalView goal={goal} color={goalColor} />
      </div>
      <div className={`absolute z-10 ${anchorClasses(positions.timer)}`}>
        <TimerView timer={timer} color={timerColor} />
      </div>
      <div className="relative z-50">
        <OverlayClient
          {...alert}
          username={username}
          apiKey={apiKey}
          test={false}
          tiers={tiers}
          feed={feed}
          positionClass={anchorClasses(positions.alert)}
        />
      </div>
    </div>
  );
}
