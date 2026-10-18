"use client";

import { useEffect, useState } from "react";
import { GoalView, type GoalState } from "@/components/overlay/GoalView";

/** The old per-feature goal link: polls its own endpoint and renders GoalView. */
export function GoalOverlayClient({
  username,
  apiKey,
  color,
}: {
  username: string;
  apiKey: string;
  color: string | null;
}) {
  const [goal, setGoal] = useState<GoalState | null>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch(
          `/api/overlay/${username}/goal?key=${encodeURIComponent(apiKey)}`,
        );
        if (!res.ok) return;
        const data: GoalState = await res.json();
        if (active) setGoal(data);
      } catch {
        // ignore transient network errors
      }
    }
    poll();
    const iv = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Disabled or no goal set → render nothing (transparent).
  if (!goal || !goal.enabled || goal.goal <= 0) return null;

  return (
    <div className="p-4">
      <GoalView goal={goal} color={color} />
    </div>
  );
}
