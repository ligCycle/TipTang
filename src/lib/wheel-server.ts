import "server-only";
import { randomInt } from "node:crypto";
import { gachaTodoRows } from "@/lib/gacha-server";
import { lockCreator } from "@/lib/combo-server";
import { isRarity } from "@/lib/gacha";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clampSlots, drawSegment, layoutSegments, LATE_PLAY_MS, type WheelTask } from "@/lib/wheel";
import { readWheelTest, TEST_NAME } from "@/lib/overlay-test";

type Tx = Prisma.TransactionClient;

/** "started" = new draw · "restored" = a cancelled spin came back · "none" = nothing to do · "empty" = no segment to draw. */
export type SpinResult = "started" | "restored" | "none" | "empty";

export const WHEEL_SELECT = {
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

/** What the settings page gets for each wheel. */
export type WheelDto = {
  id: string;
  name: string;
  price: number;
  slots: number;
  removeWhenHit: boolean;
  removed: string[];
  tasks: WheelTask[];
};

export function toDto(w: WheelRow): WheelDto {
  return {
    id: w.id,
    name: w.name,
    price: w.price,
    slots: clampSlots(w.tasks.length, w.slots),
    removeWhenHit: w.removeWhenHit,
    removed: w.removed,
    tasks: w.tasks,
  };
}

export async function listWheels(userId: string): Promise<WheelDto[]> {
  const rows = await prisma.wheel.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: WHEEL_SELECT });
  return rows.map(toDto);
}

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
export async function lockWheelForEdit(tx: Tx, wheelId: string) {
  return lockWheel(tx, wheelId);
}

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
  // Creator lock before the insert (its key to User share-locks that row):
  // keeps two parallel confirms from deadlocking (order Tip → Wheel → User).
  await lockCreator(tx, tip.creatorId);
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

/** Done to-do items stay visible (and undoable) this long. */
export const DONE_KEEP_MS = 30 * 24 * 3_600_000;

/**
 * One to-do item: a wheel result (fan + tip amount) or a combo reward (the
 * level it was reached at). `confirmedAt` = when it was added.
 */
export type TodoItem = {
  id: string;
  kind: "wheel" | "combo" | "gacha";
  /** Gacha prizes: their rarity (for the chip). */
  rarity?: "common" | "rare" | "epic" | null;
  taskText: string;
  fan: string;
  amount: number | null;
  level: number | null;
  confirmedAt: string;
  doneAt: string | null;
};

/** Open items oldest first (newest last); done items newest first, last 30 days. Wheel results and combo rewards together. */
export async function todoItems(userId: string, status: "open" | "done", take = 200): Promise<TodoItem[]> {
  const doneAt = status === "open" ? null : { gte: new Date(Date.now() - DONE_KEEP_MS) };
  const rewards = await prisma.comboReward.findMany({
    where: { userId, doneAt },
    orderBy: status === "open" ? { reachedAt: "asc" } : { doneAt: "desc" },
    take,
    select: { id: true, text: true, level: true, reachedAt: true, doneAt: true },
  });
  const rows = await prisma.spin.findMany({
    where: {
      userId,
      status: "ACTIVE",
      noAction: false,
      doneAt: status === "open" ? null : { gte: new Date(Date.now() - DONE_KEEP_MS) },
    },
    orderBy: status === "open" ? { confirmedAt: "asc" } : { doneAt: "desc" },
    take,
    select: {
      id: true,
      taskText: true,
      confirmedAt: true,
      doneAt: true,
      tip: { select: { supporterName: true, amount: true } },
    },
  });
  const pulls = await gachaTodoRows(userId, status, take, new Date(Date.now() - DONE_KEEP_MS));
  const items: TodoItem[] = [
    ...pulls.map((r) => ({
      id: r.id,
      kind: "gacha" as const,
      rarity: isRarity(r.rarity) ? r.rarity : null,
      taskText: r.prizeText,
      fan: r.tip.supporterName,
      amount: Number(r.tip.amount),
      level: null,
      confirmedAt: r.confirmedAt.toISOString(),
      doneAt: r.doneAt?.toISOString() ?? null,
    })),
    ...rows.map((r) => ({
      id: r.id,
      kind: "wheel" as const,
      taskText: r.taskText,
      fan: r.tip.supporterName,
      amount: Number(r.tip.amount),
      level: null,
      confirmedAt: r.confirmedAt.toISOString(),
      doneAt: r.doneAt?.toISOString() ?? null,
    })),
    ...rewards.map((r) => ({
      id: r.id,
      kind: "combo" as const,
      taskText: r.text,
      fan: "",
      amount: null,
      level: r.level,
      confirmedAt: r.reachedAt.toISOString(),
      doneAt: r.doneAt?.toISOString() ?? null,
    })),
  ];
  const key = (i: TodoItem) => (status === "open" ? i.confirmedAt : (i.doneAt ?? ""));
  items.sort((a, b) => (status === "open" ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))));
  return items.slice(0, take);
}

/** One spin for the wheel OBS link to play. `wheel` is null when the wheel was deleted since. */
export type OverlaySpin = {
  id: string;
  fan: string;
  taskText: string;
  segmentKey: string;
  wheel: { tasks: WheelTask[]; slots: number; removedBefore: string[] } | null;
};

function forOverlay(w: WheelRow | null, segmentKey: string): OverlaySpin["wheel"] {
  if (!w) return null;
  return { tasks: w.tasks, slots: clampSlots(w.tasks.length, w.slots), removedBefore: w.removed.filter((k) => k !== segmentKey) };
}

/**
 * The next spin to show on stream, claimed so it plays once across every
 * open wheel source: the oldest live spin not played yet, confirmed within
 * the late-play window. A pending dashboard test comes first (never claimed).
 */
export async function nextOverlaySpin(userId: string, now: number = Date.now()): Promise<OverlaySpin | null> {
  const test = await readWheelTest(userId, now);
  if (test) {
    const w = await prisma.wheel.findFirst({ where: { id: test.wheelId, userId }, select: WHEEL_SELECT });
    const seg = w ? wheelSegments(w).find((s) => s.key === test.segmentKey) : null;
    if (w && seg) {
      return {
        id: test.id,
        fan: TEST_NAME,
        taskText: w.tasks.find((t) => t.id === seg.taskId)!.text,
        segmentKey: seg.key,
        wheel: { tasks: w.tasks, slots: clampSlots(w.tasks.length, w.slots), removedBefore: w.removed },
      };
    }
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const spin = await prisma.spin.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        playedAt: null,
        confirmedAt: { gte: new Date(now - LATE_PLAY_MS) },
        tip: { status: "CONFIRMED" },
      },
      orderBy: { confirmedAt: "asc" },
      select: { id: true, taskText: true, segmentKey: true, wheel: { select: WHEEL_SELECT }, tip: { select: { supporterName: true } } },
    });
    if (!spin) return null;
    const claimed = await prisma.spin.updateMany({ where: { id: spin.id, playedAt: null }, data: { playedAt: new Date(now) } });
    if (claimed.count === 1) {
      return {
        id: spin.id,
        fan: spin.tip.supporterName,
        taskText: spin.taskText,
        segmentKey: spin.segmentKey,
        wheel: forOverlay(spin.wheel, spin.segmentKey),
      };
    }
  }
  return null;
}
