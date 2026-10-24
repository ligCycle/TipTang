"use client";

import { useEffect, useRef, useState } from "react";
import { GoalFullMoment, GoalView } from "@/components/overlay/GoalView";
import type { GoalFeed, GoalFeedItem } from "@/lib/wishlist";

const POLL_MS = 5000;
const ROTATE_MS = 8000;
const FULL_MOMENT_MS = 5000;

/**
 * The goal OBS link: polls its feed and renders GoalView. "สลับทีละชิ้น"
 * advances every 8 s (an item that just got baht comes up next); an item that
 * fills up between polls gets a short "ครบแล้ว!" moment (never on the first
 * poll, so opening the link doesn't replay old ones).
 */
export function GoalOverlayClient({
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
  const [goal, setGoal] = useState<GoalFeed | null>(null);
  const [rotateIndex, setRotateIndex] = useState(0);
  const [moment, setMoment] = useState<GoalFeedItem | null>(null);
  const prev = useRef<Map<string, { raised: number; full: boolean }> | null>(null);
  const jumpTo = useRef<string | null>(null);
  const moments = useRef<GoalFeedItem[]>([]);
  const showing = useRef(false);
  const latest = useRef<GoalFeed | null>(null);

  useEffect(() => {
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function nextMoment() {
      const m = moments.current.shift();
      if (!m || !active) {
        showing.current = false;
        setMoment(null);
        return;
      }
      showing.current = true;
      setMoment(m);
      timers.push(setTimeout(nextMoment, FULL_MOMENT_MS));
    }

    async function poll() {
      try {
        const res = await fetch(`/api/overlay/${username}/goal?key=${encodeURIComponent(apiKey)}${via ? `&via=${via}` : ""}`);
        if (!res.ok) return;
        const data: GoalFeed = await res.json();
        if (!active) return;
        const before = prev.current;
        if (before && data.type === "multi") {
          for (const i of data.items) {
            const was = before.get(i.id);
            if (was && i.raised > was.raised) jumpTo.current = i.id;
            if (was && !was.full && i.full) moments.current.push(i);
          }
          if (!showing.current && moments.current.length > 0) nextMoment();
        }
        // Only track items while the goal is "หลายชิ้น": a switch from single
        // starts clean instead of announcing old money as new.
        prev.current = data.type === "multi" ? new Map(data.items.map((i) => [i.id, { raised: i.raised, full: i.full }])) : null;
        latest.current = data;
        setGoal(data);
      } catch {
        // ignore transient network errors
      }
    }
    poll();
    const iv = setInterval(poll, POLL_MS);
    const rot = setInterval(() => {
      const g = latest.current;
      if (!g || g.type !== "multi" || g.display !== "rotate" || g.items.length === 0) return;
      const target = jumpTo.current ? g.items.findIndex((i) => i.id === jumpTo.current) : -1;
      jumpTo.current = null;
      setRotateIndex((n) => (target >= 0 ? target : n + 1));
    }, ROTATE_MS);
    return () => {
      active = false;
      clearInterval(iv);
      clearInterval(rot);
      timers.forEach(clearTimeout);
    };
  }, [username, apiKey, via]);

  if (!goal || !goal.enabled) return null;
  return (
    <div className="p-4">
      {moment ? <GoalFullMoment item={moment} /> : <GoalView goal={goal} color={color} rotateIndex={rotateIndex} />}
    </div>
  );
}
