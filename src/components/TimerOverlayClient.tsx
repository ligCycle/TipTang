"use client";

import { useEffect, useState } from "react";
import { TimerView, type TimerState } from "@/components/overlay/TimerView";
import { useLinkFeed } from "@/components/overlay/LinkFeed";

type TimerFeed = Omit<TimerState, "maxSeconds"> & { maxSeconds?: number | null };

/** The old per-feature timer link: polls its own endpoint and renders TimerView. */
export function TimerOverlayClient({
  username,
  apiKey,
  color,
  via = null,
}: {
  username: string;
  apiKey: string;
  color: string | null;
  /** Inside the bars link (doesn't count as this bar's own link). */
  via?: "bars" | null;
}) {
  const [timer, setTimer] = useState<TimerState | null>(null);
  const linkFeed = useLinkFeed();

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch(
          `/api/overlay/${username}/timer?key=${encodeURIComponent(apiKey)}${via ? `&via=${via}` : ""}`,
        );
        if (!res.ok) return;
        apply((await res.json()) as TimerFeed);
      } catch {
        // ignore transient network errors
      }
    }
    function apply(d: TimerFeed) {
      if (!active) return;
      setTimer({
        enabled: Boolean(d.enabled),
        state: d.state,
        remainingSeconds: d.remainingSeconds,
        maxSeconds: d.maxSeconds ?? 0,
        rates: d.rates,
      });
    }
    // Bars link: the feed rides on the link's one poll (src/components/overlay/LinkFeed.tsx).
    if (via === "bars" && linkFeed) {
      const off = linkFeed.on("feeds", (f) => {
        const d = (f as { timer?: TimerFeed | null } | null)?.timer;
        if (d) apply(d);
      });
      return () => {
        active = false;
        off();
      };
    }
    poll();
    const pollIv = setInterval(poll, 4000);
    return () => {
      active = false;
      clearInterval(pollIv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkFeed]);

  // Only hidden when the feature is off entirely.
  if (!timer || !timer.enabled) return null;

  return (
    <div className="p-4">
      <TimerView timer={timer} color={color} />
    </div>
  );
}
