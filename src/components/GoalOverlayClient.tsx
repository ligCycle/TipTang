"use client";

import { useEffect, useState } from "react";
import { formatBaht } from "@/lib/format";

type Goal = { title: string; goal: number; raised: number; pct: number };

// Darken a #rrggbb color by mixing toward black (amount 0..1).
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r}, ${g}, ${b})`;
}

const DEFAULT_A = "#ec4899";
const DEFAULT_B = "#be185d";

export function GoalOverlayClient({
  username,
  apiKey,
  color,
}: {
  username: string;
  apiKey: string;
  color: string | null;
}) {
  const [goal, setGoal] = useState<Goal | null>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch(
          `/api/overlay/${username}/goal?key=${encodeURIComponent(apiKey)}`,
        );
        if (!res.ok) return;
        const data: Goal = await res.json();
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

  // No goal set → render nothing (transparent).
  if (!goal || goal.goal <= 0) return null;

  const valid = Boolean(color && /^#[0-9a-fA-F]{6}$/.test(color));
  const from = valid ? color! : DEFAULT_A;
  const to = valid ? darken(color!, 0.28) : DEFAULT_B;

  return (
    <div className="p-4">
      <div className="w-full max-w-xl rounded-2xl bg-black/55 p-4 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur">
        <div className="mb-2 flex items-end justify-between gap-3">
          <span className="text-lg font-extrabold drop-shadow">
            🎯 {goal.title || "เป้าหมาย"}
          </span>
          <span className="text-lg font-black drop-shadow">{goal.pct}%</span>
        </div>
        <div className="h-6 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="flex h-full items-center justify-end rounded-full pr-2 transition-all duration-700 ease-out"
            style={{
              width: `${Math.max(goal.pct, 4)}%`,
              backgroundImage: `linear-gradient(to right, ${from}, ${to})`,
            }}
          >
            <span className="text-xs font-bold drop-shadow">
              {formatBaht(goal.raised)}
            </span>
          </div>
        </div>
        <p className="mt-1.5 text-right text-sm font-semibold text-white/90 drop-shadow">
          {formatBaht(goal.raised)} / {formatBaht(goal.goal)}
        </p>
      </div>
    </div>
  );
}
