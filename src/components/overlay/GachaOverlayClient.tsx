"use client";

import { useEffect, useRef, useState } from "react";
import type { OverlayPull } from "@/lib/gacha-server";
import type { Rarity } from "@/lib/gacha";
import { DEFAULT_COLOR } from "@/lib/colors";
import { POPUP_DELAY_MS, useStage } from "@/components/overlay/Stage";

const POLL_MS = 3000;
/** Drop 0.8 s + shake 1.2 s, then the capsule opens. */
const OPEN_AT_MS = 2000;
const SHOW_MS = 4000;

const RARITY: Record<Rarity, { color: string; label: string }> = {
  common: { color: "#94a3b8", label: "ธรรมดา" },
  rare: { color: "#8b5cf6", label: "หายาก" },
  epic: { color: "#f59e0b", label: "สุดหายาก" },
};

const KEYFRAMES = `
@keyframes gacha-drop { 0% { transform: translateY(-120%); } 70% { transform: translateY(6%); } 100% { transform: translateY(0); } }
@keyframes gacha-shake { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-9deg); } 40% { transform: rotate(8deg); } 60% { transform: rotate(-6deg); } 80% { transform: rotate(5deg); } }
@keyframes gacha-top { to { transform: translateY(-70%) rotate(-25deg); opacity: 0; } }
@keyframes gacha-glow { 0% { transform: scale(0.3); opacity: 0; } 40% { opacity: 1; } 100% { transform: scale(1.6); opacity: 0; } }
@keyframes gacha-card { 0% { transform: translateY(16px) scale(0.92); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
@keyframes gacha-spark { 0% { transform: translate(0,0) scale(0.4); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 0; } }
`;

const SPARKS = [
  [-120, -90],
  [110, -100],
  [-150, 10],
  [150, 20],
  [-80, 110],
  [90, 120],
  [0, -140],
  [0, 140],
];

/**
 * The gacha OBS link: hidden until a pull arrives, then a capsule drops,
 * shakes and opens in the rarity colour to show "<fan> ได้ <prize>!", and
 * hides again. Asking for the next pull claims it for this source, so it only
 * asks when idle (waiting pulls stay on the server) — on the main link, only
 * when the stage is free, then it waits for its turn.
 */
export function GachaOverlayClient({ username, apiKey }: { username: string; apiKey: string }) {
  const [current, setCurrent] = useState<OverlayPull | null>(null);
  const [open, setOpen] = useState(false);
  // The creator's colour (gacha → alert → brand): capsule base and the fan line.
  const [color, setColor] = useState(DEFAULT_COLOR);
  const busy = useRef(false);
  const seen = useRef(new Set<string>());
  const stage = useStage();
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    let active = true;
    let holding = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(setTimeout(r, ms)));
    async function poll() {
      if (busy.current || !stageRef.current.canClaim()) return;
      busy.current = true;
      try {
        const via = stageRef.current.embedded ? "&via=main" : "";
        const res = await fetch(`/api/overlay/${username}/gacha?key=${encodeURIComponent(apiKey)}${via}`, { cache: "no-store" });
        const data = res.ok ? ((await res.json()) as { pull: OverlayPull | null; color: string | null }) : null;
        if (data?.color && /^#[0-9a-fA-F]{6}$/.test(data.color)) setColor(data.color);
        const pull = data?.pull;
        if (!active || !pull || seen.current.has(pull.id)) {
          busy.current = false;
          return;
        }
        seen.current.add(pull.id);
        // The tip's own alert goes first, then wait for the turn (C8).
        if (stageRef.current.embedded) await wait(POPUP_DELAY_MS);
        await stageRef.current.acquire("popup");
        holding = true;
        if (!active) return;
        setOpen(false);
        setCurrent(pull);
        timers.push(setTimeout(() => setOpen(true), OPEN_AT_MS));
        timers.push(
          setTimeout(() => {
            setCurrent(null);
            setOpen(false);
            busy.current = false;
            holding = false;
            stageRef.current.release();
          }, OPEN_AT_MS + SHOW_MS),
        );
      } catch {
        busy.current = false;
      }
    }
    void poll();
    const iv = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(iv);
      timers.forEach(clearTimeout);
      if (holding) stageRef.current.release();
    };
  }, [username, apiKey]);

  if (!current) return null;
  const r = RARITY[current.rarity] ?? RARITY.common;

  return (
    <div
      className={
        stage.embedded
          ? "relative flex h-full w-full items-center justify-center overflow-hidden"
          : "relative mx-auto flex h-screen max-h-[500px] w-screen max-w-[500px] items-center justify-center overflow-hidden"
      }
    >
      <style>{KEYFRAMES}</style>
      {!open ? (
        <div key={current.id} style={{ animation: "gacha-drop 0.8s ease-out both" }}>
          <div style={{ animation: "gacha-shake 0.4s ease-in-out 0.8s 3" }} className="relative h-40 w-40">
            <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-full border-4 border-white/80" style={{ background: r.color }} />
            <div className="absolute inset-x-0 bottom-0 h-1/2 rounded-b-full border-4 border-white/80" style={{ background: color }} />
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 bg-[#120c16]" />
          </div>
        </div>
      ) : (
        <div className="relative flex flex-col items-center">
          <div
            className="absolute h-72 w-72 rounded-full"
            style={{ background: `radial-gradient(circle, ${r.color}cc 0%, transparent 70%)`, animation: "gacha-glow 1.2s ease-out both" }}
          />
          {current.rarity === "epic" &&
            SPARKS.map(([dx, dy], i) => (
              <span
                key={i}
                className="absolute h-3 w-3 rounded-full"
                style={
                  {
                    background: r.color,
                    "--dx": `${dx}px`,
                    "--dy": `${dy}px`,
                    animation: `gacha-spark 1s ease-out ${0.05 * i}s both`,
                  } as React.CSSProperties
                }
              />
            ))}
          <div
            className="relative w-[420px] rounded-2xl border-4 bg-[#120c16]/95 px-6 py-5 text-center text-white shadow-2xl"
            style={{ borderColor: r.color, animation: "gacha-card 0.5s ease-out both" }}
          >
            <span className="inline-block rounded-full px-3 py-0.5 text-sm font-bold text-[#120c16]" style={{ background: r.color }}>
              {r.label}
            </span>
            {current.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.imageUrl} alt="" className="mx-auto mt-3 h-24 w-24 rounded-xl object-cover" />
            )}
            <p className="mt-3 text-lg font-semibold" style={{ color }}>
              {current.fan} ได้
            </p>
            <p className="text-3xl font-extrabold leading-tight" style={{ color: r.color }}>
              {current.prizeText}!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
