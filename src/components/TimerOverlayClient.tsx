"use client";

import { useEffect, useRef, useState } from "react";

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

export function TimerOverlayClient({
  username,
  apiKey,
  color,
}: {
  username: string;
  apiKey: string;
  color: string | null;
}) {
  const [enabled, setEnabled] = useState(false);
  const [display, setDisplay] = useState<number | null>(null);
  // Base measurement from the last poll: remaining seconds + local time it was
  // received. The tick derives the live display from this, so we never trust
  // the client's absolute clock — only elapsed time since the poll.
  const baseRef = useRef<{ rem: number; at: number } | null>(null);

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
        setEnabled(Boolean(d.enabled && d.running));
        baseRef.current = d.running
          ? { rem: d.remainingSeconds, at: Date.now() }
          : null;
      } catch {
        // ignore transient network errors
      }
    }
    poll();
    const pollIv = setInterval(poll, 4000);
    const tickIv = setInterval(() => {
      if (!baseRef.current) {
        setDisplay(null);
        return;
      }
      const elapsed = (Date.now() - baseRef.current.at) / 1000;
      setDisplay(Math.max(0, Math.round(baseRef.current.rem - elapsed)));
    }, 250);
    return () => {
      active = false;
      clearInterval(pollIv);
      clearInterval(tickIv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Disabled or not running → render nothing (transparent).
  if (!enabled || display === null) return null;

  const valid = Boolean(color && /^#[0-9a-fA-F]{6}$/.test(color));
  const from = valid ? color! : DEFAULT_A;
  const to = valid ? darken(color!, 0.28) : DEFAULT_B;
  const over = display <= 0;

  return (
    <div className="p-4">
      <div className="inline-block rounded-2xl bg-black/55 px-6 py-4 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur">
        <p className="mb-1 text-center text-sm font-bold uppercase tracking-wide text-white/80 drop-shadow">
          ⏱️ {over ? "หมดเวลา!" : "เหลือเวลา"}
        </p>
        <p
          className="bg-clip-text text-center text-6xl font-black tabular-nums text-transparent drop-shadow"
          style={{ backgroundImage: `linear-gradient(to right, ${from}, ${to})` }}
        >
          {fmt(display)}
        </p>
      </div>
    </div>
  );
}
