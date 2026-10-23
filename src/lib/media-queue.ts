import "server-only";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * "ขอคลิป/เพลง" queue (spec docs/superpowers/specs/2026-10-23-media-request-design.md).
 * A clip rides on its tip: HELD until the tip is confirmed, then waits for the
 * creator (PENDING) or goes straight into the queue (APPROVED, auto-approve).
 * The server owns the queue; the OBS link only reports started/ended/error.
 * Every write runs under the creator lock (lockCreator) — lock order Tip → Wheel → User.
 */

/** Next position at the end of the queue. */
async function lastPosition(tx: Tx, userId: string): Promise<number> {
  const top = await tx.mediaRequest.aggregate({
    where: { userId, status: { in: ["PENDING", "APPROVED", "PLAYING"] } },
    _max: { position: true },
  });
  return (top._max.position ?? 0) + 1;
}

/**
 * The tip became CONFIRMED (tip pipeline, creator already locked). A held clip
 * joins the queue; one rejected before it started joins again; one rejected
 * after it started counts as played (never replays from the start).
 */
export async function mediaQueueConfirmTx(tx: Tx, tipId: string, now: Date): Promise<void> {
  const req = await tx.mediaRequest.findUnique({
    where: { tipId },
    select: { id: true, userId: true, status: true, startedAt: true },
  });
  if (!req) return;
  if (req.status === "CANCELLED" && req.startedAt) {
    await tx.mediaRequest.update({ where: { id: req.id }, data: { status: "PLAYED", endedAt: req.startedAt } });
    return;
  }
  if (req.status !== "HELD" && req.status !== "CANCELLED") return;
  const user = await tx.user.findUnique({ where: { id: req.userId }, select: { mediaAutoApprove: true } });
  await tx.mediaRequest.update({
    where: { id: req.id },
    data: {
      status: user?.mediaAutoApprove ? "APPROVED" : "PENDING",
      queuedAt: now,
      position: await lastPosition(tx, req.userId),
      promotedAt: null,
    },
  });
}

/** A confirmed tip was rejected: its clip leaves the queue (a playing one stops on the next poll). */
export async function mediaQueueRejectTx(tx: Tx, tipId: string): Promise<void> {
  await tx.mediaRequest.updateMany({
    where: { tipId, status: { in: ["HELD", "PENDING", "APPROVED", "PLAYING"] } },
    data: { status: "CANCELLED" },
  });
}
