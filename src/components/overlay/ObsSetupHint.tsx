"use client";

import { useEffect, useState } from "react";

/** Outside OBS (a browser tab, other live software) the hint shows this long after load. */
const SHOW_OUTSIDE_OBS_MS = 10_000;
const STATUS_POLL_MS = 5_000;

type ObsStatus = { streaming?: boolean; recording?: boolean };
type ObsStudio = { getStatus?: (cb: (s: ObsStatus) => void) => void };

/**
 * A dashed frame with "TipTang <link> · เชื่อมต่อแล้ว" while the link has
 * nothing to show, so a creator setting up OBS sees where the source is
 * instead of a black box. Never on stream: in OBS it shows only while not
 * streaming or recording (the browser source's status access, on by
 * default); elsewhere only for the first seconds after loading.
 */
export function ObsSetupHint({
  label,
  hidden = false,
  place = "center",
}: {
  label: string;
  hidden?: boolean;
  /** "bottom" for the bars link, whose bars stack from the top. */
  place?: "center" | "bottom";
}) {
  const [onAir, setOnAir] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const obs = (window as unknown as { obsstudio?: ObsStudio }).obsstudio;
    if (!obs?.getStatus) {
      const t = setTimeout(() => setExpired(true), SHOW_OUTSIDE_OBS_MS);
      return () => clearTimeout(t);
    }
    const check = () => {
      try {
        obs.getStatus?.((s) => setOnAir(Boolean(s?.streaming || s?.recording)));
      } catch {
        setOnAir(true); // can't tell: stay out of the way
      }
    };
    check();
    const id = setInterval(check, STATUS_POLL_MS);
    const live = () => setOnAir(true);
    const events = ["obsStreamingStarting", "obsStreamingStarted", "obsRecordingStarting", "obsRecordingStarted"];
    const idle = () => check();
    const stopEvents = ["obsStreamingStopped", "obsRecordingStopped"];
    events.forEach((e) => window.addEventListener(e, live));
    stopEvents.forEach((e) => window.addEventListener(e, idle));
    return () => {
      clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, live));
      stopEvents.forEach((e) => window.removeEventListener(e, idle));
    };
  }, []);

  if (hidden || onAir || expired) return null;
  return (
    <div
      className={`pointer-events-none fixed inset-2 z-0 flex justify-center rounded-2xl border-4 border-dashed border-pink-400/70 ${place === "bottom" ? "items-end pb-4" : "items-center"}`}
    >
      <div className="rounded-2xl bg-[#120c16]/85 px-6 py-4 text-center text-white">
        <p className="text-2xl font-extrabold">TipTang {label}</p>
        <p className="mt-1 text-lg font-semibold text-emerald-300">เชื่อมต่อแล้ว</p>
        <p className="mt-1 text-sm text-white/70">ป้ายนี้หายเองตอนเริ่มไลฟ์หรืออัด</p>
      </div>
    </div>
  );
}
