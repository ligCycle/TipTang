"use client";

import { useEffect, useRef, useState } from "react";
import { WheelPreview, SPIN_MS } from "@/components/features/WheelPreview";
import { clampSlots, layoutSegments } from "@/lib/wheel";
import type { OverlaySpin } from "@/lib/wheel-server";
import { POPUP_DELAY_MS, useStage } from "@/components/overlay/Stage";

const POLL_MS = 3000;
const SETTLE_MS = 400;
const RESULT_MS = 5000;

/**
 * The wheel OBS link: hidden until a spin arrives, then the wheel spins to
 * the server's result, shows "<fan> หมุนได้ <task>!" and hides again. It only
 * asks for the next spin when idle: fetching claims a spin for this source, so
 * waiting spins stay on the server (a reload or a reject can't lose them).
 * On the main link it also waits for the stage to be free before it asks,
 * then for its turn (src/components/overlay/Stage.tsx).
 */
export function WheelOverlayClient({ username, apiKey }: { username: string; apiKey: string }) {
  const [current, setCurrent] = useState<OverlaySpin | null>(null);
  const [showResult, setShowResult] = useState(false);
  const seen = useRef(new Set<string>());
  const queue = useRef<OverlaySpin[]>([]);
  const playing = useRef(false);
  const fetching = useRef(false);
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

    function playNext() {
      const s = queue.current.shift();
      if (!s || !active) {
        playing.current = false;
        setCurrent(null);
        setShowResult(false);
        if (holding) {
          holding = false;
          stageRef.current.release();
        }
        if (active) void poll();
        return;
      }
      playing.current = true;
      const lands =
        s.wheel !== null &&
        layoutSegments(s.wheel.tasks, clampSlots(s.wheel.tasks.length, s.wheel.slots), s.wheel.removedBefore).some(
          (x) => x.key === s.segmentKey,
        );
      setCurrent(s);
      setShowResult(!lands);
      const spinFor = lands ? SPIN_MS + SETTLE_MS : 0;
      timers.push(setTimeout(() => setShowResult(true), spinFor));
      timers.push(setTimeout(playNext, spinFor + RESULT_MS));
    }

    async function poll() {
      if (playing.current || fetching.current || !stageRef.current.canClaim()) return;
      fetching.current = true;
      try {
        const via = stageRef.current.embedded ? "&via=main" : "";
        const res = await fetch(`/api/overlay/${username}/wheel?key=${encodeURIComponent(apiKey)}${via}`);
        if (!res.ok) return;
        const { spin } = (await res.json()) as { spin: OverlaySpin | null };
        if (!active || !spin || seen.current.has(spin.id)) return;
        seen.current.add(spin.id);
        playing.current = true;
        // The tip's own alert goes first, then wait for the turn (C8).
        if (stageRef.current.embedded) await wait(POPUP_DELAY_MS);
        await stageRef.current.acquire("popup");
        holding = true;
        if (!active) return;
        queue.current.push(spin);
        playNext();
      } catch {
        // ignore transient network errors
      } finally {
        fetching.current = false;
      }
    }
    poll();
    const iv = setInterval(poll, POLL_MS);
    return () => {
      active = false;
      clearInterval(iv);
      timers.forEach(clearTimeout);
      if (holding) stageRef.current.release();
    };
  }, [username, apiKey]);

  if (!current) return null;

  return (
    <div
      className={
        stage.embedded
          ? "relative flex h-full w-full items-center justify-center"
          : "relative mx-auto flex h-screen max-h-[600px] w-screen max-w-[600px] items-center justify-center"
      }
    >
      {current.wheel && (
        <WheelPreview
          key={current.id}
          tasks={current.wheel.tasks}
          slots={current.wheel.slots}
          removed={current.wheel.removedBefore}
          spinTo={current.segmentKey}
          className="h-[86%] w-[86%] drop-shadow-[0_0_24px_rgba(236,72,153,0.55)]"
        />
      )}
      {showResult && (
        <div className="absolute inset-x-6 bottom-6 rounded-2xl border-2 border-brand-500 bg-[#120c16]/90 px-5 py-3 text-center text-white shadow-2xl">
          <p className="text-lg font-semibold text-pink-200">{current.fan} หมุนได้</p>
          <p className="text-3xl font-extrabold leading-tight text-[#ff8a3d]">{current.taskText}!</p>
        </div>
      )}
    </div>
  );
}
