/**
 * Whether OBS is streaming or recording, read through the browser source's
 * status access (on by default). Used by the setup hint (hides on air) and
 * by the polls (slow down off air, src/lib/poll-pace.ts).
 */

const STATUS_POLL_MS = 5_000;

type ObsStatus = { streaming?: boolean; recording?: boolean };
type ObsStudio = { getStatus?: (cb: (s: ObsStatus) => void) => void };

function obs(): ObsStudio | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { obsstudio?: ObsStudio }).obsstudio;
}

/** False outside OBS, or when the source may not read OBS status. */
export function canReadObsStatus(): boolean {
  return Boolean(obs()?.getStatus);
}

/**
 * Calls `cb(live)` now and whenever it may have changed; returns a stop
 * function. Where the status can't be read it reports live once, so pages
 * outside OBS (a browser tab, other live software) keep their full pace.
 */
export function watchObsLive(cb: (live: boolean) => void): () => void {
  const studio = obs();
  if (!studio?.getStatus) {
    cb(true);
    return () => {};
  }
  const check = () => {
    try {
      studio.getStatus?.((s) => cb(Boolean(s?.streaming || s?.recording)));
    } catch {
      cb(true); // can't tell: act as live
    }
  };
  check();
  const id = setInterval(check, STATUS_POLL_MS);
  const live = () => cb(true);
  const startEvents = ["obsStreamingStarting", "obsStreamingStarted", "obsRecordingStarting", "obsRecordingStarted"];
  const stopEvents = ["obsStreamingStopped", "obsRecordingStopped"];
  startEvents.forEach((e) => window.addEventListener(e, live));
  stopEvents.forEach((e) => window.addEventListener(e, check));
  return () => {
    clearInterval(id);
    startEvents.forEach((e) => window.removeEventListener(e, live));
    stopEvents.forEach((e) => window.removeEventListener(e, check));
  };
}
