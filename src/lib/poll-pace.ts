/**
 * How often an OBS page asks the server. Every request is billed on Vercel
 * (Active CPU), and most of the bill is OBS pages polling, so a page asks at
 * its own pace only while it can matter: OBS is streaming or recording and
 * the source is on screen. Otherwise it asks every OFF_AIR_POLL_MS, and asks
 * at once when it goes live again (src/components/overlay/LinkFeed.tsx).
 * Pure, no "server-only" import — so it runs under `node --test`.
 */

/** Not streaming/recording, scene not shown or tab hidden. */
export const OFF_AIR_POLL_MS = 15_000;

/** A feature on its own OBS link (not the main or bars link). */
export const OWN_LINK_POLL_MS = 10_000;

export function pollDelayMs(everyMs: number, s: { shown: boolean; streaming: boolean }): number {
  return s.shown && s.streaming ? everyMs : Math.max(everyMs, OFF_AIR_POLL_MS);
}
