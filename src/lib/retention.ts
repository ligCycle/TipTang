/**
 * How long payment slips are kept. A slip shows the full names and (masked)
 * account numbers of both sides, and is only needed while the creator checks
 * the payment and for a while after in case of a dispute. After that the
 * image is deleted; the tip/order row stays, and so does its transRef, so a
 * reused slip is still caught as a duplicate.
 */
export const SLIP_KEEP_DAYS = 90;
/** Slips never confirmed or rejected are deleted after this long anyway. */
export const SLIP_KEEP_DAYS_UNDECIDED = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

export function slipCutoffs(now: Date): { decided: Date; any: Date } {
  return {
    decided: new Date(now.getTime() - SLIP_KEEP_DAYS * DAY_MS),
    any: new Date(now.getTime() - SLIP_KEEP_DAYS_UNDECIDED * DAY_MS),
  };
}

/** The purge job's daily run time (vercel.json "0 20 * * *" = 03:00 Bangkok). */
export const PURGE_HOUR_UTC = 20;

/**
 * The night the daily job will delete a slip: the first run at or after the
 * slip's retention cutoff. Used to show creators the date in advance, so it
 * must follow the same rule as the purge route (age counted from createdAt).
 */
export function slipDeleteDate(createdAt: Date, decided: boolean): Date {
  const days = decided ? SLIP_KEEP_DAYS : SLIP_KEEP_DAYS_UNDECIDED;
  const due = new Date(createdAt.getTime() + days * DAY_MS);
  const run = new Date(
    Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate(), PURGE_HOUR_UTC),
  );
  // The job deletes rows strictly older than the cutoff, so a run at the
  // exact due moment doesn't count yet.
  if (run.getTime() <= due.getTime()) run.setUTCDate(run.getUTCDate() + 1);
  return run;
}
