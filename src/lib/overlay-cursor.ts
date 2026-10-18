/**
 * The `after` cursor an overlay sends on its next poll. While alerts are
 * switched off the cursor jumps to server time, so tips confirmed during
 * that time never replay as a burst when alerts come back on.
 */
export function nextCursor(
  prev: string,
  tipTimes: (string | null)[],
  serverNow: string,
  alertsEnabled: boolean,
): string {
  if (!alertsEnabled) return serverNow > prev ? serverNow : prev;
  let c = prev;
  for (const t of tipTimes) if (t && t > c) c = t;
  return c;
}
