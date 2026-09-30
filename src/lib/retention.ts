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
