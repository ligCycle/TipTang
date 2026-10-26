"use client";

import { useEffect, useRef, useState } from "react";
import { useLinkFeed } from "@/components/overlay/LinkFeed";
import { DEFAULT_COLOR } from "@/lib/colors";
import type { ComboFeed } from "@/lib/combo";

const POLL_MS = 2000;
const CELEBRATE_MS = 3000;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("")}`;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The combo OBS link: hidden until a combo runs. Shows the level, the bar,
 * "อีก ฿X → <reward>", the countdown and unlocked rewards; a short
 * celebration for every level reached; then the end summary for ~15 s.
 */
export function ComboOverlayClient({
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
  const [feed, setFeed] = useState<ComboFeed>({ phase: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const [celebrate, setCelebrate] = useState<{ key: string; level: number; text: string | null } | null>(null);
  // Highest level already shown per combo (a test and a real combo can interleave).
  const seen = useRef(new Map<string, number>());
  const firstPoll = useRef(true);
  const queue = useRef<{ key: string; level: number; text: string | null }[]>([]);
  const showing = useRef(false);
  const linkFeed = useLinkFeed();

  useEffect(() => {
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function nextCelebration() {
      const c = queue.current.shift();
      if (!c || !active) {
        showing.current = false;
        setCelebrate(null);
        return;
      }
      showing.current = true;
      setCelebrate(c);
      timers.push(setTimeout(nextCelebration, CELEBRATE_MS));
    }

    async function poll() {
      try {
        const res = await fetch(`/api/overlay/${username}/combo?key=${encodeURIComponent(apiKey)}${via ? `&via=${via}` : ""}`);
        if (!res.ok) return;
        apply((await res.json()) as ComboFeed);
      } catch {
        // ignore transient network errors
      }
    }

    function apply(data: ComboFeed) {
      if (!active) return;
      if (data.phase === "running") {
        // A combo already running when the link opens is shown as it is (no replay);
        // one that starts while it's open celebrates every level past 1.
        const known = seen.current.get(data.id);
        const from = known ?? (firstPoll.current ? data.level : 1);
        for (let level = from + 1; level <= data.level; level++) {
          const text = data.unlocked.find((u) => u.level === level)?.text ?? null;
          queue.current.push({ key: `${data.id}_${level}`, level, text });
        }
        seen.current.set(data.id, Math.max(from, data.level));
        if (!showing.current && queue.current.length > 0) nextCelebration();
      }
      firstPoll.current = false;
      setFeed(data);
    }
    const tick = setInterval(() => setNow(Date.now()), 1000);
    // Bars link: the feed rides on the link's one poll (src/components/overlay/LinkFeed.tsx).
    if (via === "bars" && linkFeed) {
      const off = linkFeed.on("feeds", (f) => {
        const d = (f as { combo?: ComboFeed | null } | null)?.combo;
        if (d) apply(d);
      });
      return () => {
        active = false;
        off();
        clearInterval(tick);
        timers.forEach(clearTimeout);
      };
    }
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(iv);
      clearInterval(tick);
      timers.forEach(clearTimeout);
    };
  }, [username, apiKey, via, linkFeed]);

  if (feed.phase === "idle") return null;
  if (feed.phase === "summary" && Date.parse(feed.until) <= now) return null;
  return <ComboView feed={feed} now={now} celebrate={celebrate} color={color} />;
}

type Celebration = { key: string; level: number; text: string | null };

/** The combo card for a running combo or its summary (the OBS link and the settings preview). */
export function ComboView({
  feed,
  now,
  celebrate,
  color,
}: {
  feed: Exclude<ComboFeed, { phase: "idle" }>;
  now: number;
  celebrate: Celebration | null;
  color: string | null;
}) {
  const base = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
  const card = {
    borderColor: base,
    boxShadow: `0 0 28px ${base}88`,
    background: "rgba(18, 12, 22, 0.9)",
  };
  const badge = { backgroundImage: `linear-gradient(135deg, ${base}, ${shade(base, -0.25)})` };

  return (
    <div className="p-3">
      <div className="mx-auto w-full max-w-[576px] rounded-2xl border-2 px-4 py-3 text-white" style={card}>
        {feed.phase === "running" && celebrate ? (
          <div key={celebrate.key} className="animate-[ttpop_0.4s_ease-out] text-center">
            <p className="text-lg font-extrabold">คอมโบทิป</p>
            <p className="text-4xl font-black" style={{ color: shade(base, 0.45) }}>
              เลเวล {celebrate.level}!
            </p>
            {celebrate.text && (
              <p className="mt-1 text-base">
                ปลดล็อก: <span className="font-bold">{celebrate.text}</span>
              </p>
            )}
          </div>
        ) : feed.phase === "running" ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-lg font-extrabold">คอมโบทิป</span>
              <span className="rounded-full px-3 py-0.5 text-base font-extrabold" style={badge}>
                เลเวล {feed.level}
              </span>
            </div>
            <div className="mt-2 h-4 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{
                  width: `${Math.min(100, (feed.progress / Math.max(1, feed.size)) * 100)}%`,
                  backgroundImage: `linear-gradient(90deg, ${base}, ${shade(base, 0.35)})`,
                }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-[15px]">
              <span className="min-w-0 truncate" style={{ color: shade(base, 0.6) }}>
                อีก ฿{Math.max(0, feed.size - feed.progress).toLocaleString()} →{" "}
                <span className="font-bold text-white">{feed.nextReward ?? `ขึ้นเลเวล ${feed.level + 1}`}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-white/80">{clock(Date.parse(feed.endsAt) - now)}</span>
            </div>
            {feed.unlocked.length > 0 && (
              <p className="mt-1 truncate text-xs text-white/65">
                ปลดล็อกแล้ว: {feed.unlocked.map((u) => u.text).join(" · ")}
              </p>
            )}
          </>
        ) : (
          <div className="text-center">
            <p className="text-base font-extrabold">คอมโบทิปจบแล้ว</p>
            <p className="text-3xl font-black" style={{ color: shade(base, 0.45) }}>
              เลเวล {feed.level}
            </p>
            <p className="text-sm" style={{ color: shade(base, 0.6) }}>
              รวม ฿{feed.total.toLocaleString()} จาก {feed.fans} คน · ขอบคุณทุกคน
            </p>
            {(feed.won.length > 0 || feed.almost) && (
              <ul className="mx-auto mt-2 max-w-sm text-left text-sm">
                {feed.won.map((w) => (
                  <li key={w.level} className="flex gap-2 border-t border-white/10 py-0.5">
                    <span className="w-16 shrink-0 text-xs text-white/60">เลเวล {w.level}</span>
                    <span className="truncate">{w.text}</span>
                  </li>
                ))}
                {feed.almost && (
                  <li className="flex gap-2 border-t border-white/10 py-0.5 text-white/50">
                    <span className="w-16 shrink-0 text-xs">เลเวล {feed.almost.level}</span>
                    <span className="truncate">{feed.almost.text} (เกือบได้!)</span>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes ttpop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
