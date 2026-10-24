"use client";

import { useEffect, useRef, useState } from "react";
import type { PkFeed } from "@/lib/pk-server";
import { barShare, remainingSec } from "@/lib/pk";

const LIVE_POLL_MS = 2000;
const IDLE_POLL_MS = 5000;

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/**
 * The PK OBS link: a split bar in the two side colours with names, totals
 * and a countdown; "time's up" while confirms in flight still count; then the
 * winner for a few seconds; hidden when there's no match. The countdown uses
 * the server's clock (endsAt − serverNow), not this computer's.
 */
export function PkOverlayClient({ username, apiKey }: { username: string; apiKey: string }) {
  const [match, setMatch] = useState<PkFeed | null>(null);
  // Server time minus local time, from the last poll.
  const skew = useRef(0);
  // "Now" on the server clock, moved forward by the local timer.
  const [serverNow, setServerNow] = useState(0);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      let next: PkFeed | null = null;
      try {
        const res = await fetch(`/api/overlay/${username}/pk?key=${encodeURIComponent(apiKey)}`, { cache: "no-store" });
        if (res.ok) {
          next = ((await res.json()) as { match: PkFeed | null }).match;
          if (next) {
            skew.current = new Date(next.serverNow).getTime() - Date.now();
            setServerNow(new Date(next.serverNow).getTime());
          }
          if (active) setMatch(next);
        }
      } catch {
        // try again next tick
      }
      if (active) timer = setTimeout(poll, next ? LIVE_POLL_MS : IDLE_POLL_MS);
    }
    void poll();
    const tick = setInterval(() => setServerNow(Date.now() + skew.current), 500);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      clearInterval(tick);
    };
  }, [username, apiKey]);

  if (!match) return null;
  const share = barShare(match.totalA, match.totalB);
  const left = remainingSec(new Date(match.endsAt), new Date(serverNow || new Date(match.serverNow).getTime()));
  const winnerName = match.winner === "A" ? match.nameA : match.winner === "B" ? match.nameB : null;

  return (
    <div className="mx-auto w-[800px] px-2 pt-2 text-white">
      <div className="rounded-2xl bg-[#120c16]/90 px-5 py-4 shadow-2xl">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-xl font-extrabold" style={{ color: match.colorA }}>
              {match.nameA}
            </p>
            <p className="text-3xl font-extrabold tabular-nums">฿{match.totalA.toLocaleString("th-TH")}</p>
          </div>
          <div className="shrink-0 text-center">
            {match.phase === "live" ? (
              <p className="text-3xl font-extrabold tabular-nums">{clock(left)}</p>
            ) : match.phase === "grace" ? (
              <p className="text-sm font-semibold text-white/80">หมดเวลา · รอนับทิปที่กำลังยืนยัน</p>
            ) : (
              <p className="text-3xl font-extrabold">PK</p>
            )}
          </div>
          <div className="min-w-0 text-right">
            <p className="truncate text-xl font-extrabold" style={{ color: match.colorB }}>
              {match.nameB}
            </p>
            <p className="text-3xl font-extrabold tabular-nums">฿{match.totalB.toLocaleString("th-TH")}</p>
          </div>
        </div>
        <div className="mt-3 flex h-6 overflow-hidden rounded-full bg-white/10">
          <div className="h-full transition-[width] duration-700 ease-out" style={{ width: `${share}%`, background: match.colorA }} />
          <div className="h-full flex-1" style={{ background: match.colorB }} />
        </div>
        {match.kind === "duo" && match.phase !== "ended" && (
          <p className="mt-2 text-center text-xs font-semibold text-white/70">นับจากทิปที่แต่ละฝั่งยืนยัน</p>
        )}
        {match.phase === "ended" && (
          <p className="mt-3 text-center text-2xl font-extrabold" style={{ color: winnerName ? (match.winner === "A" ? match.colorA : match.colorB) : "#ffffff" }}>
            {winnerName ? `${winnerName} ชนะ!` : "เสมอ!"}
          </p>
        )}
      </div>
    </div>
  );
}
