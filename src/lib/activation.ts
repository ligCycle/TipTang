/**
 * Creator activation funnel — pure, no DB, runs under `node --test`.
 *
 * A creator is placed at the FIRST step they have not completed:
 *   NO_PROMPTPAY → NO_OVERLAY → NO_TIP → (ACTIVE | IDLE)
 * except that anyone with a confirmed tip is ACTIVE/IDLE straight away —
 * creators from before `overlayLastSeenAt` existed have tips but no overlay
 * timestamp, and must not look stuck at NO_OVERLAY.
 */

export type Stage = "NO_PROMPTPAY" | "NO_OVERLAY" | "NO_TIP" | "ACTIVE" | "IDLE";

/** Stages that get a one-time reminder — the two the creator can fix alone. */
export type NudgeTemplate = "NO_PROMPTPAY" | "NO_OVERLAY";

/** A confirmed tip within this many days counts as "still active". */
export const ACTIVE_WINDOW_DAYS = 30;

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

export function stage(input: StageInput, now: Date): Stage {
  if (!input.promptpayId) return "NO_PROMPTPAY";
  if (input.lastConfirmedTipAt) {
    const ageMs = now.getTime() - input.lastConfirmedTipAt.getTime();
    return ageMs <= ACTIVE_WINDOW_DAYS * 86_400_000 ? "ACTIVE" : "IDLE";
  }
  if (!input.overlayLastSeenAt) return "NO_OVERLAY";
  return "NO_TIP";
}

export function nudgeTemplate(s: Stage): NudgeTemplate | null {
  return s === "NO_PROMPTPAY" || s === "NO_OVERLAY" ? s : null;
}

export type SortableRow = StageInput & { createdAt: Date; stage: Stage };

/**
 * Sort for the admin table: by stage, then "stuck longest" first — oldest
 * signup for the pre-tip stages, longest silence for IDLE, and for ACTIVE the
 * most recent tip first (they are fine; show the liveliest at the top).
 */
export function compareRows(a: SortableRow, b: SortableRow): number {
  const byStage = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
  if (byStage !== 0) return byStage;
  const aTip = a.lastConfirmedTipAt?.getTime() ?? 0;
  const bTip = b.lastConfirmedTipAt?.getTime() ?? 0;
  if (a.stage === "IDLE") return aTip - bTip; // oldest last tip first
  if (a.stage === "ACTIVE") return bTip - aTip; // newest last tip first
  return a.createdAt.getTime() - b.createdAt.getTime(); // oldest signup first
}
