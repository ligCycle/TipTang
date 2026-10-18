"use client";

import { useEffect, useState } from "react";
import { TimerView, type TimerState } from "@/components/overlay/TimerView";

/** The old per-feature timer link: polls its own endpoint and renders TimerView. */
export function TimerOverlayClient({
  username,
  apiKey,
  color,
}: {
  username: string;
  apiKey: string;
  color: string | null;
}) {
  const [timer, setTimer] = useState<TimerState | null>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch(
          `/api/overlay/${username}/timer?key=${encodeURIComponent(apiKey)}`,
        );
        if (!res.ok) return;
        const d = await res.json();
        if (!active) return;
        setTimer({
          enabled: Boolean(d.enabled),
          state: d.state,
          remainingSeconds: d.remainingSeconds,
          maxSeconds: d.maxSeconds ?? 0,
        });
      } catch {
        // ignore transient network errors
      }
    }
    poll();
    const pollIv = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(pollIv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only hidden when the feature is off entirely.
  if (!timer || !timer.enabled) return null;

  return (
    <div className="p-4">
      <TimerView timer={timer} color={color} />
    </div>
  );
}
