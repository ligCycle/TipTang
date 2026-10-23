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
  peelRows,
  cleanItemName,
  type Allocation,
  type GoalDisplay,
  type GoalStyle,
  type GoalType,
  type ItemState,
  type GoalFeed,
  pctOf,
} from "@/lib/wishlist";
import { countFans } from "@/lib/combo";

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

/**
 * Give every confirmed tip of the current round that has no allocation yet its
 * place on the items, oldest first. That covers the tip being confirmed now,
 * tips confirmed while the goal was single or had no items, and an auto-confirm
 * whose features failed — so the items always add up to the round's tips.
 * Runs under the creator lock. Row time = the tip's confirmation (its round).
 */
export async function backfillTx(tx: Tx, userId: string): Promise<void> {
  const u = await tx.user.findUnique({
    where: { id: userId },
    select: { goalType: true, goalOverlayEnabled: true, goalStartedAt: true },
  });
  if (!u || u.goalType !== "multi") return;
  const tips = await tx.tip.findMany({
    where: {
      creatorId: userId,
      status: "CONFIRMED",
      ...(u.goalStartedAt ? { confirmedAt: { gte: u.goalStartedAt } } : {}),
      wishAllocs: { none: {} },
    },
    orderBy: { confirmedAt: "asc" },
    select: { id: true, amount: true, wishItemId: true, confirmedAt: true },
    take: 5000,
  });
  if (tips.length === 0) return;
  // Skip tips another transaction holds (e.g. a parallel auto-confirm that
  // will place its own tip, or a reject): inserting their rows would wait on
  // that lock while it waits on our creator lock — a deadlock. They are placed
  // by their own pipeline, or by the next backfill.
  const free = await freeTips(tx, tips.map((t) => t.id));
  const todo = tips.filter((t) => free.has(t.id));
  if (todo.length === 0) return;
  const items: ItemState[] = await goalItems(tx, userId, u.goalStartedAt);
  if (items.length === 0) return;
  const data: { tipId: string; itemId: string; amount: number; createdAt: Date }[] = [];
  for (const t of todo) {
    // Card off: the fan's choice is ignored (counts as no choice).
    const rows = allocate(items, baht(t.amount), u.goalOverlayEnabled ? t.wishItemId : null);
    for (const r of rows) {
      data.push({ tipId: t.id, itemId: r.itemId, amount: r.amount, createdAt: t.confirmedAt ?? new Date() });
      const it = items.find((i) => i.id === r.itemId);
      if (it) it.raised += r.amount;
    }
  }
  if (data.length > 0) await tx.wishAlloc.createMany({ data });
}

/** A tip became CONFIRMED (inside the tip pipeline, creator already locked): store where its baht lands. */
export async function wishConfirmTx(tx: Tx, tipId: string): Promise<void> {
  const tip = await tx.tip.findUnique({ where: { id: tipId }, select: { creatorId: true } });
  if (!tip) return;
  // Re-confirming a rejected tip starts fresh.
  await tx.wishAlloc.deleteMany({ where: { tipId } });
  await backfillTx(tx, tip.creatorId);
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
  const all = await tx.wishAlloc.findMany({
    where: { itemId: fromId, ...(since ? { createdAt: { gte: since } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, tipId: true, amount: true, createdAt: true },
  });
  // A tip being rejected right now is about to take its rows away anyway;
  // leave them (waiting on its lock would deadlock with our creator lock).
  const free = await freeTips(tx, [...new Set(all.map((r) => r.tipId))]);
  const { creates, deletes, updates } = peelRows(all.filter((r) => free.has(r.tipId)), targets);
  if (creates.length > 0) await tx.wishAlloc.createMany({ data: creates });
  if (deletes.length > 0) await tx.wishAlloc.deleteMany({ where: { id: { in: deletes } } });
  for (const u of updates) await tx.wishAlloc.update({ where: { id: u.id }, data: { amount: u.amount } });
}

/**
 * The tips no other transaction holds, now share-locked so they can't change
 * under us (our own tip, locked FOR UPDATE by this transaction, is included).
 */
async function freeTips(tx: Tx, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Tip" WHERE "id" = ANY(${ids}) FOR KEY SHARE SKIP LOCKED`;
  return new Set(rows.map((r) => r.id));
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
          await tx.wishItem.create({
            data: { userId, name: cleanItemName(u.goalTitle) ?? "เป้าหมาย", price: Math.min(amount, 1_000_000), position: 0 },
          });
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
      // Tips of this round confirmed while single (or before any item) take their place now.
      if (type === "multi") await backfillTx(tx, userId);
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

/** The goal OBS feed: settings plus, per item, how many different fans helped this round. */
export async function goalFeed(userId: string): Promise<GoalFeed | null> {
  const s = await goalSettings(userId);
  if (!s) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { goalStartedAt: true } });
  const since = u?.goalStartedAt ?? null;
  const rows =
    s.type === "multi" && s.items.length > 0
      ? await prisma.wishAlloc.findMany({
          where: { itemId: { in: s.items.map((i) => i.id) }, ...(since ? { createdAt: { gte: since } } : {}) },
          select: { itemId: true, tip: { select: { supporterName: true } } },
        })
      : [];
  const names = new Map<string, string[]>();
  for (const r of rows) names.set(r.itemId, [...(names.get(r.itemId) ?? []), r.tip.supporterName]);
  return {
    enabled: s.enabled,
    type: s.type,
    style: s.style,
    display: s.display,
    single: { title: s.single.title, goal: s.single.amount, raised: s.single.raised, pct: pctOf(s.single.raised, s.single.amount) },
    items: s.items.map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price,
      raised: i.raised,
      imageUrl: i.imageUrl,
      full: i.full,
      fans: countFans(names.get(i.id) ?? []),
    })),
  };
}
