/**
 * Has the creator's live program actually loaded the overlay? `overlayLastSeenAt`
 * is written by the overlay's own poll (not by the browser preview, which runs
 * in test mode and never polls), so it is the only proof the URL made it into
 * OBS / Streamlabs / TikTok LIVE Studio. Pure, so it is unit-tested.
 */

/** How often the OBS page re-checks while it is still waiting for the first load. */
export const OVERLAY_STATUS_POLL_MS = 10_000;

/** JSON value from the API → Date, or null when missing or unparseable. */
export function parseLastSeen(value: unknown): Date | null {
  if (typeof value !== "string" || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The getting-started step is done once a live program has loaded the
 * overlay — or once a tip has come in, since link-only creators (streaming
 * from a phone) never load an overlay and shouldn't be nagged about it.
 */
export function overlaySetUp(lastSeenAt: Date | null, confirmedTips: number): boolean {
  return lastSeenAt !== null || confirmedTips > 0;
}
