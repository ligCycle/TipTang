"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PkFeed } from "@/lib/pk-server";
import { barShare, remainingSec, type PkSide } from "@/lib/pk";

export type PkPick = { matchId: string; side: PkSide } | null;

const LIVE_MS = 5000;
const IDLE_MS = 30_000;

/**
 * Donate page, "PK": while the creator runs a two-sides match, the fan can
 * choose which side this tip goes to (optional). Polls the public feed (every
 * 5 s during a match, 30 s otherwise, paused while the tab is hidden) and
 * clears the choice once the match is no longer live.
 */
export function PkPicker({ username, value, onChange }: { username: string; value: PkPick; onChange: (next: PkPick) => void }) {
  const t = useTranslations("profile");
  const [match, setMatch] = useState<PkFeed | null>(null);
  const [now, setNow] = useState(0);
  const skew = useRef(0);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  }, [onChange, value]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    async function poll() {
      let live = false;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(`/api/pk/live/${encodeURIComponent(username)}`);
          if (res.ok) {
            const d = (await res.json()) as { match: PkFeed | null };
            const m = d.match && d.match.phase === "live" ? d.match : null;
            if (m) skew.current = new Date(m.serverNow).getTime() - Date.now();
            live = Boolean(m);
            if (active) {
              setMatch(m);
              if (m) setNow(new Date(m.serverNow).getTime());
              // The match ended or changed: a choice for it no longer stands.
              if (valueRef.current && valueRef.current.matchId !== m?.id) onChangeRef.current(null);
            }
          }
        } catch {
          // try again later
        }
      }
      if (active) timer = setTimeout(poll, live ? LIVE_MS : IDLE_MS);
    }
    void poll();
    const tick = setInterval(() => setNow(Date.now() + skew.current), 1000);
    // Back on the tab: check now (the match may have ended while hidden).
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [username]);

  if (!match) return null;
  const left = remainingSec(new Date(match.endsAt), new Date(now || new Date(match.serverNow).getTime()));
  const share = barShare(match.totalA, match.totalB);
  const side = (s: PkSide) => {
    const selected = value?.matchId === match.id && value.side === s;
    const color = s === "A" ? match.colorA : match.colorB;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => onChange(selected ? null : { matchId: match.id, side: s })}
        className={`min-w-0 flex-1 rounded-xl border-2 px-3 py-2 text-left transition ${selected ? "ring-2 ring-offset-1" : "opacity-90 hover:opacity-100"}`}
        style={{ borderColor: color, background: selected ? `${color}22` : undefined }}
      >
        <span className="block truncate text-sm font-bold" style={{ color }}>
          {s === "A" ? match.nameA : match.nameB}
        </span>
        <span className="block text-xs font-semibold text-brand-900/70">฿{(s === "A" ? match.totalA : match.totalB).toLocaleString()}</span>
      </button>
    );
  };

  return (
    <fieldset>
      <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium text-brand-900/80">
        <span>{t("pkLabel")}</span>
        <span className="text-xs font-semibold tabular-nums text-brand-900/60">
          {t("pkLeft", { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` })}
        </span>
      </legend>
      <div className="flex h-2 overflow-hidden rounded-full bg-brand-100">
        <div className="h-full transition-[width] duration-700" style={{ width: `${share}%`, background: match.colorA }} />
        <div className="h-full flex-1" style={{ background: match.colorB }} />
      </div>
      <div className="mt-2 flex gap-2" role="radiogroup" aria-label={t("pkLabel")}>
        {side("A")}
        {side("B")}
      </div>
      <p className="mt-1 text-xs text-brand-900/55">{t("pkHint")}</p>
    </fieldset>
  );
}
