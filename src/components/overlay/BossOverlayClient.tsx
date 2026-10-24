"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_COLOR } from "@/lib/colors";
import type { BossChain, BossFeed, BossKillView } from "@/lib/boss";

const POLL_MS = 2000;
const BANNER_MS = 5000;
const HIT_MS = 900;

type Live = Extract<BossFeed, { phase: "live" }>;
type Banner = { key: string; kill: BossKillView } | { key: string; chain: BossChain };

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The boss OBS link: the current boss with its HP bar; a shake and "−฿N"
 * when damage goes up; a "ปิดบอส" banner for every boss defeated (5 s each,
 * one at a time), or one summary card for a long chain. Hidden when the card
 * is off or the list is empty.
 */
export function BossOverlayClient({ username, apiKey, color }: { username: string; apiKey: string; color: string | null }) {
  const [feed, setFeed] = useState<BossFeed>({ phase: "off" });
  const [hit, setHit] = useState<{ key: number; amount: number } | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const last = useRef<{ run: number; life: number; bossDefId: string; damage: number } | null>(null);
  const played = useRef(new Set<string>());
  const queue = useRef<Banner[]>([]);
  const showing = useRef(false);

  useEffect(() => {
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function nextBanner() {
      const b = queue.current.shift();
      if (!b || !active) {
        showing.current = false;
        setBanner(null);
        return;
      }
      showing.current = true;
      setBanner(b);
      timers.push(setTimeout(nextBanner, BANNER_MS));
    }

    function enqueue(b: Banner) {
      if (played.current.has(b.key)) return;
      played.current.add(b.key);
      queue.current.push(b);
      if (!showing.current) nextBanner();
    }

    async function poll() {
      try {
        const res = await fetch(`/api/overlay/${username}/boss?key=${encodeURIComponent(apiKey)}`);
        if (!res.ok) return;
        const data = (await res.json()) as BossFeed;
        if (!active) return;
        if (data.phase === "live") {
          // The flash needs the same boss life on both polls (C9); never on the first.
          const prev = last.current;
          if (prev && prev.run === data.run && prev.life === data.life && prev.bossDefId === data.bossDefId && data.boss.damage > prev.damage) {
            setHit({ key: Date.now(), amount: data.boss.damage - prev.damage });
            timers.push(setTimeout(() => active && setHit(null), HIT_MS));
          }
          last.current = { run: data.run, life: data.life, bossDefId: data.bossDefId, damage: data.boss.damage };
          if (data.kill) enqueue({ key: data.kill.id, kill: data.kill });
          if (data.chain) enqueue({ key: `chain_${data.chain.id}`, chain: data.chain });
        } else {
          last.current = null;
        }
        setFeed(data);
      } catch {
        // ignore transient network errors
      }
    }
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(iv);
      timers.forEach(clearTimeout);
    };
  }, [username, apiKey]);

  const base = color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
  const card = {
    borderColor: base,
    boxShadow: `0 0 28px ${base}88`,
    background: "rgba(18, 12, 22, 0.9)",
  };

  if (!banner && feed.phase !== "live") return null;

  return (
    <div className="p-3">
      <div className="mx-auto w-full max-w-[576px] rounded-2xl border-2 px-4 py-3 text-white" style={card}>
        {banner ? (
          <div key={banner.key} className="animate-[ttpop_0.4s_ease-out] text-center">
            {"kill" in banner ? (
              <>
                {banner.kill.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={banner.kill.imageUrl} alt="" className="mx-auto mb-1 h-20 w-20 rounded-xl object-cover opacity-80 grayscale" />
                )}
                <p className="text-3xl font-black" style={{ color: shade(base, 0.45) }}>
                  ปิดบอส {banner.kill.bossName}!
                </p>
                <p className="mt-1 text-[15px]">
                  ปิดโดย <span className="font-bold">{banner.kill.killer}</span>
                  <span className="text-white/60"> · </span>
                  ดาเมจสูงสุด <span className="font-bold">{banner.kill.topFan}</span> ฿{banner.kill.topAmount.toLocaleString()}
                </p>
                {banner.kill.reward && (
                  <p className="mt-1.5 text-base">
                    ปลดล็อก: <span className="font-bold">{banner.kill.reward}</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-4xl font-black" style={{ color: shade(base, 0.45) }}>
                  ปิดบอส {banner.chain.count} ตัวรวด!
                </p>
                <p className="mt-1 text-[15px]">
                  ปิดท้ายโดย <span className="font-bold">{banner.chain.lastKiller}</span>
                </p>
                <p className="mt-1 text-sm text-white/70">รางวัลทั้งหมดเข้าภารกิจค้างทำแล้ว</p>
              </>
            )}
          </div>
        ) : feed.phase === "live" ? (
          <BossCard feed={feed} base={base} hit={hit} />
        ) : null}
      </div>
      <style>{`@keyframes ttpop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes ttshake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(3px); } }
@keyframes ttrise { from { transform: translateY(6px); opacity: 0; } 30% { opacity: 1; } to { transform: translateY(-18px); opacity: 0; } }
@keyframes ttslide { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
    </div>
  );
}

function BossCard({ feed, base, hit }: { feed: Live; base: string; hit: { key: number; amount: number } | null }) {
  const { boss } = feed;
  const left = Math.max(0, boss.hp - boss.damage);
  const pct = Math.min(100, (left / Math.max(1, boss.hp)) * 100);
  return (
    <div key={`${feed.run}_${feed.life}_${feed.bossDefId}`} className="flex animate-[ttslide_0.5s_ease-out] items-center gap-3">
      <div key={hit?.key} className={`relative h-24 w-24 shrink-0 ${hit ? "animate-[ttshake_0.5s_ease-out]" : ""}`}>
        {boss.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={boss.imageUrl} alt="" className="h-full w-full rounded-xl object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center rounded-xl text-4xl font-black" style={{ background: `${base}33`, color: shade(base, 0.45) }}>
            {boss.name.slice(0, 1)}
          </div>
        )}
        {hit && (
          <span className="absolute inset-x-0 top-1 animate-[ttrise_0.9s_ease-out_forwards] text-center text-2xl font-black text-white [text-shadow:0_2px_6px_rgba(0,0,0,0.8)]">
            −฿{hit.amount.toLocaleString()}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xl font-extrabold">{boss.name}</span>
          <span className="shrink-0 text-xs font-semibold text-white/60">
            บอส {boss.index}/{boss.total}
          </span>
        </div>
        <div className="mt-2 h-5 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full transition-[width] duration-700"
            style={{ width: `${pct}%`, backgroundImage: `linear-gradient(90deg, ${shade(base, -0.2)}, ${base})` }}
          />
        </div>
        <p className="mt-1.5 text-[15px] tabular-nums" style={{ color: shade(base, 0.6) }}>
          HP {left.toLocaleString()} / {boss.hp.toLocaleString()}
          <span className="text-white/60"> · ทิป 1 บาท = 1 ดาเมจ</span>
        </p>
      </div>
    </div>
  );
}
