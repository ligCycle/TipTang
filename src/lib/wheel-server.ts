import "server-only";
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clampSlots, drawSegment, layoutSegments, type WheelTask } from "@/lib/wheel";

type Tx = Prisma.TransactionClient;

/** "started" = new draw · "restored" = a cancelled spin came back · "none" = nothing to do · "empty" = no segment to draw. */
export type SpinResult = "started" | "restored" | "none" | "empty";

const WHEEL_SELECT = {
  id: true,
  userId: true,
  name: true,
  price: true,
  slots: true,
  removeWhenHit: true,
  removed: true,
  updatedAt: true,
  tasks: { orderBy: { position: "asc" }, select: { id: true, text: true, noAction: true } },
} satisfies Prisma.WheelSelect;

export type WheelRow = Prisma.WheelGetPayload<{ select: typeof WHEEL_SELECT }>;

/** The segments still on a wheel (slots re-clamped in case tasks were added since). */
export function wheelSegments(w: Pick<WheelRow, "tasks" | "slots" | "removed">) {
  return layoutSegments(w.tasks as WheelTask[], clampSlots(w.tasks.length, w.slots), w.removed);
}

/** The wheel fans see: the active one, only when the card is on and segments remain. */
export async function wheelForFans(userId: string): Promise<WheelRow | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wheelEnabled: true, activeWheel: { select: WHEEL_SELECT } },
  });
  const w = user?.wheelEnabled ? user.activeWheel : null;
  return w && wheelSegments(w).length > 0 ? w : null;
}

/** Serialise everything touching one wheel (segment removal must not race). */
async function lockWheel(tx: Tx, wheelId: string): Promise<WheelRow | null> {
  await tx.$queryRaw`SELECT "id" FROM "Wheel" WHERE "id" = ${wheelId} FOR UPDATE`;
  return tx.wheel.findUnique({ where: { id: wheelId }, select: WHEEL_SELECT });
}

/**
 * Draw (or restore) the spin for a tip being confirmed, inside the caller's
 * transaction. Uses the wheel the fan saw and the segments left on it now.
 */
export async function startSpinTx(tx: Tx, tipId: string, now: Date): Promise<SpinResult> {
  const tip = await tx.tip.findUnique({
    where: { id: tipId },
    select: { creatorId: true, spinWheelId: true, spin: { select: { id: true, status: true, wheelId: true, segmentKey: true } } },
  });
  if (!tip?.spinWheelId) return "none";
  const spin = tip.spin;
  if (spin?.status === "ACTIVE") return "none";
  if (spin) {
    // Confirming again after a reject: same result, no re-roll.
    if (spin.wheelId) {
      const w = await lockWheel(tx, spin.wheelId);
      if (w?.removeWhenHit && !w.removed.includes(spin.segmentKey)) {
        await tx.wheel.update({ where: { id: w.id }, data: { removed: [...w.removed, spin.segmentKey] } });
      }
    }
    await tx.spin.update({ where: { id: spin.id }, data: { status: "ACTIVE" } });
    return "restored";
  }
  const w = await lockWheel(tx, tip.spinWheelId);
  if (!w || w.userId !== tip.creatorId) return "empty";
  const seg = drawSegment(wheelSegments(w), () => randomInt(0, 1_000_000) / 1_000_000);
  if (!seg) return "empty";
  const task = w.tasks.find((t) => t.id === seg.taskId)!;
  await tx.spin.create({
    data: {
      userId: tip.creatorId,
      tipId,
      wheelId: w.id,
      segmentKey: seg.key,
      taskText: task.text,
      noAction: task.noAction,
      confirmedAt: now,
    },
  });
  if (w.removeWhenHit) {
    await tx.wheel.update({ where: { id: w.id }, data: { removed: [...w.removed, seg.key] } });
  }
  return "started";
}

/** For tips that arrive already confirmed (auto-verify / auto-confirm). */
export async function startSpin(tipId: string): Promise<SpinResult> {
  return prisma.$transaction((tx) => startSpinTx(tx, tipId, new Date()));
}

/**
 * Rejecting a confirmed tip: its spin is cancelled and, if the draw took a
 * segment off the wheel, the segment goes back — unless another live spin
 * holds the same segment (drawn again after a reset).
 */
export async function cancelSpinTx(tx: Tx, tipId: string): Promise<void> {
  const spin = await tx.spin.findUnique({ where: { tipId }, select: { id: true, status: true, wheelId: true, segmentKey: true } });
  if (!spin || spin.status !== "ACTIVE") return;
  await tx.spin.update({ where: { id: spin.id }, data: { status: "CANCELLED" } });
  if (!spin.wheelId) return;
  const w = await lockWheel(tx, spin.wheelId);
  if (!w || !w.removed.includes(spin.segmentKey)) return;
  const held = await tx.spin.count({
    where: { wheelId: w.id, segmentKey: spin.segmentKey, status: "ACTIVE" },
  });
  if (held > 0) return;
  await tx.wheel.update({ where: { id: w.id }, data: { removed: w.removed.filter((k) => k !== spin.segmentKey) } });
}

/** Whether confirming this tip would find its wheel gone or empty (the confirm button warns first). */
export async function spinBlocker(tipId: string): Promise<"empty" | null> {
  const tip = await prisma.tip.findUnique({
    where: { id: tipId },
    select: { creatorId: true, spinWheelId: true, spin: { select: { id: true } } },
  });
  if (!tip?.spinWheelId || tip.spin) return null;
  const w = await prisma.wheel.findUnique({ where: { id: tip.spinWheelId }, select: WHEEL_SELECT });
  return !w || w.userId !== tip.creatorId || wheelSegments(w).length === 0 ? "empty" : null;
}
