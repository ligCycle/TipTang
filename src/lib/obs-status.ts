/**
 * Dashboard status of an OBS link (src/components/features/ObsBar.tsx):
 * open right now, placed before, or never placed.
 */

/** Within this long of a poll a link counts as open right now (the server's LIVE_MS). */
export const LINK_LIVE_MS = 120_000;

export type LinkStatus = { state: "live" | "seen" | "never"; at: Date | null };

/**
 * The newest of several "last loaded" times. `placedBefore` is the old
 * alerts-link time (`overlayLastSeenAt`): a creator whose OBS loaded the
 * alerts link before the main link existed has placed it already, so it
 * reads "placed", never "not placed" (it never makes a link "live").
 */
export function linkStatus(times: (string | null | undefined)[], now: number, placedBefore?: string | null): LinkStatus {
  const parse = (t: string | null | undefined) => {
    const d = t ? new Date(t) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  };
  const at = times
    .map(parse)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (at) return { state: now - at.getTime() <= LINK_LIVE_MS ? "live" : "seen", at };
  const before = parse(placedBefore);
  return before ? { state: "seen", at: before } : { state: "never", at: null };
}
