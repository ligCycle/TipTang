import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lockCreator } from "@/lib/combo-server";
import { goalRaised } from "@/lib/goal";
import {
  allocate,
  isGoalDisplay,
  isGoalStyle,
  isGoalType,
  moveOnDelete,
  spillOnPrice,
  type Allocation,
  type GoalDisplay,
  type GoalStyle,
  type GoalType,
  type ItemState,
} from "@/lib/wishlist";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** Whole baht for allocation (tip amounts are Decimal(10,2); new tips are whole baht). */
function baht(amount: unknown): number {
  const n = Math.round(Number(amount));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type GoalItem = ItemState & { name: string; imageUrl: string | null; full: boolean; position: number };

/** Live items in order with what the current round has raised for each. */
export async function goalItems(db: Db, userId: string, since: Date | null): Promise<GoalItem[]> {
  const items = await db.wishItem.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, price: true, imageUrl: true, position: true },
  });
  if (items.length === 0) return [];
  const sums = await db.wishAlloc.groupBy({
    by: ["itemId"],
    where: { itemId: { in: items.map((i) => i.id) }, ...(since ? { createdAt: { gte: since } } : {}) },
    _sum: { amount: true },
  });
  const raised = new Map(sums.map((s) => [s.itemId, s._sum.amount ?? 0]));
  return items.map((i) => {
    const r = raised.get(i.id) ?? 0;
    return { ...i, raised: r, full: r >= i.price };
  });
}

/** A tip became CONFIRMED (inside the tip pipeline, creator already locked): store where its baht lands. */
export async function wishConfirmTx(tx: Tx, tipId: string, now: Date): Promise<void> {
  const tip = await tx.tip.findUnique({
    where: { id: tipId },
    select: {
      amount: true,
      wishItemId: true,
      creator: { select: { id: true, goalType: true, goalOverlayEnabled: true, goalStartedAt: true } },
    },
  });
  if (!tip || tip.creator.goalType !== "multi") return;
  // Re-confirming a rejected tip starts fresh.
  await tx.wishAlloc.deleteMany({ where: { tipId } });
  const items = await goalItems(tx, tip.creator.id, tip.creator.goalStartedAt);
  // Card off: the fan's choice is ignored (counts as no choice).
  const chosen = tip.creator.goalOverlayEnabled ? tip.wishItemId : null;
  const rows = allocate(items, baht(tip.amount), chosen);
  if (rows.length === 0) return;
  await tx.wishAlloc.createMany({ data: rows.map((r) => ({ tipId, itemId: r.itemId, amount: r.amount, createdAt: now })) });
}

/** A confirmed tip was rejected: its baht leaves every item it landed on. */
export async function wishRejectTx(tx: Tx, tipId: string): Promise<void> {
  await tx.wishAlloc.deleteMany({ where: { tipId } });
}

/**
 * Move `amount` baht off `fromId` onto `targets` (in order), peeling the item's
 * current-round rows newest first. Each moved piece keeps its tip and time, so
 * a later reject of that tip still removes it and the round it counts in stays.
 */
async function moveRows(tx: Tx, fromId: string, since: Date | null, targets: Allocation[]): Promise<void> {
  const rows = await tx.wishAlloc.findMany({
    where: { itemId: fromId, ...(since ? { createdAt: { gte: since } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, tipId: true, amount: true, createdAt: true },
  });
  const queue = targets.map((t) => ({ ...t }));
  for (const row of rows) {
    let left = row.amount;
    while (left > 0 && queue.length > 0) {
      const t = queue[0];
      const take = Math.min(left, t.amount);
      await tx.wishAlloc.create({ data: { tipId: row.tipId, itemId: t.itemId, amount: take, createdAt: row.createdAt } });
      left -= take;
      t.amount -= take;
      if (t.amount === 0) queue.shift();
    }
    if (left === row.amount) continue;
    if (left === 0) await tx.wishAlloc.delete({ where: { id: row.id } });
    else await tx.wishAlloc.update({ where: { id: row.id }, data: { amount: left } });
    if (queue.length === 0) break;
  }
}

async function roundStart(tx: Tx, userId: string): Promise<Date | null> {
  const u = await tx.user.findUnique({ where: { id: userId }, select: { goalStartedAt: true } });
  return u?.goalStartedAt ?? null;
}

export class GoalError extends Error {
  constructor(public code: "not_found" | "last_item" | "too_many" | "invalid") {
    super(code);
  }
}

/** Delete an item: an unfilled one's baht moves to the others (top unfilled first); a full one just disappears. */
export async function deleteItem(userId: string, itemId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    const since = await roundStart(tx, userId);
    const items = await goalItems(tx, userId, since);
    if (!items.some((i) => i.id === itemId)) throw new GoalError("not_found");
    if (items.length <= 1) throw new GoalError("last_item");
    const targets = moveOnDelete(items, itemId);
    if (targets.length > 0) await moveRows(tx, itemId, since, targets);
    await tx.wishItem.update({ where: { id: itemId }, data: { deletedAt: new Date() } });
  });
}

/** Change an item; a lower price spills what it frees to the next unfilled items. */
export async function updateItem(
  userId: string,
  itemId: string,
  data: { name?: string; price?: number; imageUrl?: string | null },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    const since = await roundStart(tx, userId);
    const items = await goalItems(tx, userId, since);
    if (!items.some((i) => i.id === itemId)) throw new GoalError("not_found");
    if (data.price !== undefined) {
      const { to } = spillOnPrice(items, itemId, data.price);
      if (to.length > 0) await moveRows(tx, itemId, since, to);
    }
    await tx.wishItem.update({ where: { id: itemId }, data });
  });
}

/** What the settings page and the overlay need about the goal. */
export async function goalSettings(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      goalType: true,
      goalStyle: true,
      goalDisplay: true,
      goalTitle: true,
      goalAmount: true,
      goalStartedAt: true,
      goalColor: true,
      alertColor: true,
      goalOverlayEnabled: true,
    },
  });
  if (!u) return null;
  return {
    enabled: u.goalOverlayEnabled,
    type: (isGoalType(u.goalType) ? u.goalType : "single") as GoalType,
    style: (isGoalStyle(u.goalStyle) ? u.goalStyle : "classic") as GoalStyle,
    display: (isGoalDisplay(u.goalDisplay) ? u.goalDisplay : "all") as GoalDisplay,
    color: u.goalColor,
    alertColor: u.alertColor,
    single: {
      title: u.goalTitle ?? "",
      amount: u.goalAmount ? Number(u.goalAmount) : 0,
      raised: await goalRaised(userId, u.goalStartedAt),
      startedAt: u.goalStartedAt?.toISOString() ?? null,
    },
    items: await goalItems(prisma, userId, u.goalStartedAt),
  };
}

/**
 * Switch the goal type. Going to "หลายชิ้น" with no items turns the single
 * goal into item 1 with its progress (one allocation row per tip of the round);
 * going back shows the top item as the single goal's title and amount.
 */
export async function setGoalType(userId: string, type: GoalType): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      await lockCreator(tx, userId);
      const u = await tx.user.findUnique({
        where: { id: userId },
        select: { goalType: true, goalTitle: true, goalAmount: true, goalStartedAt: true },
      });
      if (!u || u.goalType === type) return;
      if (type === "multi") {
        const live = await tx.wishItem.count({ where: { userId, deletedAt: null } });
        const amount = u.goalAmount ? Math.round(Number(u.goalAmount)) : 0;
        if (live === 0 && amount > 0) {
          const item = await tx.wishItem.create({
            data: { userId, name: (u.goalTitle || "เป้าหมาย").slice(0, 40), price: Math.min(amount, 1_000_000), position: 0 },
            select: { id: true },
          });
          const tips = await tx.tip.findMany({
            where: { creatorId: userId, status: "CONFIRMED", ...(u.goalStartedAt ? { confirmedAt: { gte: u.goalStartedAt } } : {}) },
            select: { id: true, amount: true, confirmedAt: true },
          });
          const rows = tips
            .map((t) => ({ tipId: t.id, itemId: item.id, amount: baht(t.amount), createdAt: t.confirmedAt ?? new Date() }))
            .filter((r) => r.amount > 0);
          if (rows.length > 0) await tx.wishAlloc.createMany({ data: rows });
        }
      } else {
        const top = await tx.wishItem.findFirst({
          where: { userId, deletedAt: null },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: { name: true, price: true },
        });
        if (top) await tx.user.update({ where: { id: userId }, data: { goalTitle: top.name, goalAmount: top.price } });
      }
      await tx.user.update({ where: { id: userId }, data: { goalType: type } });
    },
    { timeout: 15_000, maxWait: 5_000 },
  );
}

/** Whether a fan's item choice stands now (card on, multi, live, not full). */
export async function validChoice(userId: string, itemId: string | null): Promise<string | null> {
  if (!itemId) return null;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { goalType: true, goalOverlayEnabled: true, goalStartedAt: true },
  });
  if (!u || u.goalType !== "multi" || !u.goalOverlayEnabled) return null;
  const item = (await goalItems(prisma, userId, u.goalStartedAt)).find((i) => i.id === itemId);
  return item && !item.full ? item.id : null;
}
