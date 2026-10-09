/**
 * Creator activation funnel — pure, no DB, runs under `node --test`.
 *
 * A creator is placed at the FIRST step they have not completed:
 *   NO_PROMPTPAY → NO_OVERLAY → NO_TIP → (ACTIVE | IDLE)
 * except that anyone with a confirmed tip is ACTIVE/IDLE straight away —
 * creators from before `overlayLastSeenAt` existed have tips but no overlay
 * timestamp, and must not look stuck at NO_OVERLAY.
 *
 * ACTIVE means a tip in the last 30 days OR the overlay running in the last
 * 14 days: tips on small channels are sparse, and a streamer who still runs
 * the overlay every week is using TipTang even when nobody tipped lately.
 */

export type Stage = "NO_PROMPTPAY" | "NO_OVERLAY" | "NO_TIP" | "ACTIVE" | "IDLE";

/** Stages that get a one-time reminder — the two the creator can fix alone. */
export type NudgeTemplate = "NO_PROMPTPAY" | "NO_OVERLAY";

/** A confirmed tip within this many days counts as "still active". */
export const ACTIVE_WINDOW_DAYS = 30;

/** So does the overlay polling within this many days (for creators with a tip). */
export const OVERLAY_ACTIVE_DAYS = 14;

const DAY_MS = 86_400_000;

/** Table order: the earliest blockers first, healthy accounts last. */
export const STAGE_ORDER: readonly Stage[] = [
  "NO_PROMPTPAY",
  "NO_OVERLAY",
  "NO_TIP",
  "IDLE",
  "ACTIVE",
];

export type StageInput = {
  promptpayId: string | null;
  overlayLastSeenAt: Date | null;
  /** Most recent CONFIRMED tip, or null if there has never been one. */
  lastConfirmedTipAt: Date | null;
};

function within(d: Date | null, days: number, now: Date): boolean {
  return d !== null && now.getTime() - d.getTime() <= days * DAY_MS;
}

export function stage(input: StageInput, now: Date): Stage {
  if (!input.promptpayId) return "NO_PROMPTPAY";
  if (input.lastConfirmedTipAt) {
    return within(input.lastConfirmedTipAt, ACTIVE_WINDOW_DAYS, now) ||
      within(input.overlayLastSeenAt, OVERLAY_ACTIVE_DAYS, now)
      ? "ACTIVE"
      : "IDLE";
  }
  if (!input.overlayLastSeenAt) return "NO_OVERLAY";
  return "NO_TIP";
}

/** Latest sign of life: the newer of the last tip and the last overlay poll. */
function lastActivity(r: StageInput): number {
  return Math.max(
    r.lastConfirmedTipAt?.getTime() ?? 0,
    r.overlayLastSeenAt?.getTime() ?? 0,
  );
}

export function nudgeTemplate(s: Stage): NudgeTemplate | null {
  return s === "NO_PROMPTPAY" || s === "NO_OVERLAY" ? s : null;
}

export type SortableRow = StageInput & { createdAt: Date; stage: Stage };

/**
 * Sort for the admin table: by stage, then "stuck longest" first — oldest
 * signup for the pre-tip stages, longest silence (tip or overlay) for IDLE,
 * and for ACTIVE the most recent activity first (they are fine; show the
 * liveliest at the top).
 */
export function compareRows(a: SortableRow, b: SortableRow): number {
  const byStage = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
  if (byStage !== 0) return byStage;
  if (a.stage === "IDLE") return lastActivity(a) - lastActivity(b);
  if (a.stage === "ACTIVE") return lastActivity(b) - lastActivity(a);
  return a.createdAt.getTime() - b.createdAt.getTime(); // oldest signup first
}
