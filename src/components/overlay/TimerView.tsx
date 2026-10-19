"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

export type TimerState = {
  enabled: boolean;
  state: "running" | "paused" | "stopped";
  remainingSeconds: number;
  maxSeconds: number;
  /** Tip rates, shown under the clock. Missing on older payloads. */
  rates?: {
    add: { baht: number; seconds: number };
    reduce: { baht: number; seconds: number; minAmount: number } | null;
  };
};

// "1 นาที" / "30 วิ" / "1.5 นาที" for a rate's time step.
function step(seconds: number): string {
  if (seconds < 60) return `${seconds} วิ`;
  return `${Math.round((seconds / 60) * 10) / 10} นาที`;
}

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

function fmt(total: number): string {
  const s = Math.max(0, total);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * The subathon clock. Each new `timer` (from a poll) resets the base; while
 * running, a local tick counts down from it — only elapsed time is trusted,
 * never the client's absolute clock.
 */
export function TimerView({ timer, color }: { timer: TimerState | null; color: string | null }) {
  // When the current `timer` arrived (adjusted during render when a new poll
  // result comes in) and a 250 ms clock; the display is derived from both.
  const [received, setReceived] = useState<{ timer: TimerState | null; at: number }>(() => ({
    timer,
    at: Date.now(),
  }));
  const [now, setNow] = useState(() => Date.now());
  if (received.timer !== timer) setReceived({ timer, at: now });

  useEffect(() => {
    const tickIv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tickIv);
  }, []);

  const display =
    timer == null
      ? null
      : timer.state === "running"
        ? Math.max(0, Math.round(timer.remainingSeconds - (now - received.at) / 1000))
        : timer.remainingSeconds; // paused / stopped → static time

  // Only hidden when the feature is off entirely.
  if (!timer || !timer.enabled || display === null) return null;

  const valid = Boolean(color && /^#[0-9a-fA-F]{6}$/.test(color));
  const from = valid ? color! : DEFAULT_A;
  const to = valid ? darken(color!, 0.28) : DEFAULT_B;
  const state = timer.state;

  const label =
    state === "paused"
      ? "พักอยู่"
      : state === "running" && display <= 0
        ? "หมดเวลา!"
        : "เหลือเวลา";

  return (
    <div className="inline-block rounded-2xl bg-black/55 px-6 py-4 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur">
      <p className="mb-1 flex items-center justify-center gap-1.5 text-sm font-bold uppercase tracking-wide text-white/80 drop-shadow">
        <Icon name="clock" className="h-4 w-4" />
        {label}
      </p>
      <p
        className={`bg-clip-text text-center text-6xl font-black tabular-nums text-transparent drop-shadow ${
          state === "paused" ? "opacity-70" : ""
        }`}
        style={{ backgroundImage: `linear-gradient(to right, ${from}, ${to})` }}
      >
        {fmt(display)}
      </p>
      {timer.rates && (
        <div className="mt-2 space-y-0.5 border-t border-white/15 pt-2 text-center text-sm font-semibold text-white/85 drop-shadow">
          <p>
            ทิปทุก {timer.rates.add.baht} บาท{" "}
            <span className="text-emerald-300">+{step(timer.rates.add.seconds)}</span>
          </p>
          {timer.rates.reduce && (
            <p>
              ทิปลดเวลาทุก {timer.rates.reduce.baht} บาท{" "}
              <span className="text-rose-300">−{step(timer.rates.reduce.seconds)}</span>
              {timer.rates.reduce.minAmount > timer.rates.reduce.baht && (
                <span className="text-white/60"> (ขั้นต่ำ {timer.rates.reduce.minAmount} บาท)</span>
              )}
            </p>
          )}
        </div>
      )}
      {timer.maxSeconds > 0 && (
        <p className="mt-1 text-center text-xs font-semibold text-white/70 drop-shadow">
          สูงสุด {fmt(timer.maxSeconds)}
        </p>
      )}
    </div>
  );
}
