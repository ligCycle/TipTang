import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readComboTest } from "@/lib/overlay-test";
import {
  addAmount,
  cleanRows,
  COOLDOWN_MS,
  countFans,
  COUNTDOWN_MS,
  DEFAULT_ROWS,
  isDifficulty,
  LIVE_MS,
  removeAmount,
  rewardsView,
  sizeAt,
  SUMMARY_MS,
  testSample,
  type ComboFeed,
  sizesFor,
  START_FANS,
  typicalTip,
  WINDOW_MS,
  type Difficulty,
  type LevelRow,
} from "@/lib/combo";

type Tx = Prisma.TransactionClient;

const TYPICAL_DAYS_MS = 30 * 24 * 3_600_000;

/** Whole baht for combo maths (tip amounts are Decimal(10,2); new tips are whole baht). */
function baht(amount: unknown): number {
  const n = Math.round(Number(amount));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The creator's level table: stored rows when valid, else the defaults. */
export function rowsOf(stored: unknown, difficulty: Difficulty): LevelRow[] {
  return cleanRows(stored, difficulty === "custom") ?? cleanRows(stored, false) ?? DEFAULT_ROWS;
}

export function difficultyOf(v: unknown): Difficulty {
  return isDifficulty(v) ? v : "medium";
}

/** Median-based typical tip from the last 30 days of confirmed tips. */
export async function typicalFor(db: Tx | typeof prisma, userId: string, minTip: number, now: Date): Promise<number> {
  const tips = await db.tip.findMany({
    where: { creatorId: userId, status: "CONFIRMED", confirmedAt: { gte: new Date(now.getTime() - TYPICAL_DAYS_MS) } },
    select: { amount: true },
    orderBy: { confirmedAt: "desc" },
    take: 2000,
  });
  return typicalTip(tips.map((t) => baht(t.amount)).filter((a) => a > 0), minTip);
}

/** Serialise every combo change for one creator. */
async function lockCreator(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}

/** An ACTIVE combo whose countdown ran out becomes ENDED at lastTipAt + countdown; the cooldown starts then. */
export async function endIfExpiredTx(tx: Tx, userId: string, now: Date): Promise<void> {
  const active = await tx.combo.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true, lastTipAt: true } });
  if (!active) return;
  const endsAt = new Date(active.lastTipAt.getTime() + COUNTDOWN_MS);
  if (now < endsAt) return;
  await tx.combo.update({ where: { id: active.id }, data: { status: "ENDED", endedAt: endsAt } });
  await tx.user.update({ where: { id: userId }, data: { comboCooldownUntil: new Date(endsAt.getTime() + COOLDOWN_MS) } });
}

type ComboRow = { id: string; level: number; progress: number; total: number; sizes: number[]; rewards: string[] };

/** Add tips (oldest first) to a combo: ComboTip rows with the level after each, rewards for every level reached. */
async function addTipsTx(
  tx: Tx,
  userId: string,
  combo: ComboRow,
  tips: { id: string; amount: unknown }[],
  now: Date,
): Promise<void> {
  let state = { level: combo.level, progress: combo.progress };
  let total = combo.total;
  const reached: number[] = [];
  for (const t of tips) {
    const amount = baht(t.amount);
    const r = addAmount(state, amount, combo.sizes);
    await tx.comboTip.create({ data: { tipId: t.id, comboId: combo.id, amount, levelAfter: r.level } });
    reached.push(...r.reached);
    state = { level: r.level, progress: r.progress };
    total += amount;
  }
  await tx.combo.update({
    where: { id: combo.id },
    data: { level: state.level, progress: state.progress, total, lastTipAt: now },
  });
  const rewards = reached
    .map((level) => ({ level, text: combo.rewards[level - 1] ?? "" }))
    .filter((r) => r.text.length > 0);
  if (rewards.length > 0) {
    await tx.comboReward.createMany({
      data: rewards.map((r) => ({ userId, comboId: combo.id, level: r.level, text: r.text, reachedAt: now })),
      skipDuplicates: true,
    });
  }
}

/**
 * A tip just became CONFIRMED (inside the caller's transaction, after the
 * status update). It counts only if the card is on and the combo link is open;
 * it joins the running combo, or may start one with the other eligible tips of
 * the last 5 minutes (3+ different fans, no cooldown).
 */
export async function comboConfirmTx(tx: Tx, tipId: string, now: Date): Promise<void> {
  const tip = await tx.tip.findUnique({
    where: { id: tipId },
    select: { id: true, creatorId: true, amount: true, status: true, comboTip: { select: { counted: true } } },
  });
  if (!tip || tip.status !== "CONFIRMED" || tip.comboTip?.counted) return;
  await lockCreator(tx, tip.creatorId);
  // Re-confirming a rejected tip is a new confirmation: drop its old, uncounted row.
  if (tip.comboTip) await tx.comboTip.delete({ where: { tipId } });
  await endIfExpiredTx(tx, tip.creatorId, now);

  const user = await tx.user.findUnique({
    where: { id: tip.creatorId },
    select: {
      comboEnabled: true,
      comboOverlaySeenAt: true,
      comboCooldownUntil: true,
      comboDifficulty: true,
      comboRows: true,
      minTipAmount: true,
    },
  });
  const live = Boolean(user?.comboOverlaySeenAt && user.comboOverlaySeenAt.getTime() >= now.getTime() - LIVE_MS);
  const eligible = Boolean(user?.comboEnabled) && live;
  // Written every time: a tip re-confirmed while the link is closed must stop counting.
  await tx.tip.update({ where: { id: tipId }, data: { comboEligible: eligible } });
  if (!user || !eligible) return;

  const active = await tx.combo.findFirst({
    where: { userId: tip.creatorId, status: "ACTIVE" },
    select: { id: true, level: true, progress: true, total: true, sizes: true, rewards: true },
  });
  if (active) {
    await addTipsTx(tx, tip.creatorId, active, [tip], now);
    return;
  }
  if (user.comboCooldownUntil && now < user.comboCooldownUntil) return;

  // Lock the window's tips (skipping any another request holds, e.g. one being
  // rejected right now) so none can change status while it joins the combo.
  const since = new Date(now.getTime() - WINDOW_MS);
  const window = await tx.$queryRaw<{ id: string; amount: unknown; supporterName: string }[]>`
    SELECT t."id", t."amount", t."supporterName" FROM "Tip" t
    WHERE t."creatorId" = ${tip.creatorId} AND t."status" = 'CONFIRMED' AND t."comboEligible" = true
      AND t."confirmedAt" >= ${since}
      AND NOT EXISTS (SELECT 1 FROM "ComboTip" c WHERE c."tipId" = t."id")
    ORDER BY t."confirmedAt" ASC
    FOR UPDATE OF t SKIP LOCKED`;
  if (countFans(window.map((t) => t.supporterName)) < START_FANS) return;

  const difficulty = difficultyOf(user.comboDifficulty);
  const rows = rowsOf(user.comboRows, difficulty);
  const typical = await typicalFor(tx, tip.creatorId, user.minTipAmount, now);
  const combo = await tx.combo.create({
    data: {
      userId: tip.creatorId,
      startedAt: now,
      lastTipAt: now,
      sizes: sizesFor(rows, difficulty, typical),
      rewards: rows.map((r) => r.reward),
    },
    select: { id: true, level: true, progress: true, total: true, sizes: true, rewards: true },
  });
  await addTipsTx(tx, tip.creatorId, combo, window, now);
}

/** For tips confirmed on arrival (auto-verify / auto-confirm). */
export async function applyCombo(tipId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Same order as the confirm/reject PATCH (Tip, then User): a reject arriving
    // now waits, or has already made the tip non-CONFIRMED.
    await tx.$queryRaw`SELECT "id" FROM "Tip" WHERE "id" = ${tipId} FOR UPDATE`;
    await comboConfirmTx(tx, tipId, new Date());
  });
}

/** A counted tip was rejected: its baht leaves the combo; levels and rewards stay. */
export async function comboRejectTx(tx: Tx, tipId: string, now: Date): Promise<void> {
  const ct = await tx.comboTip.findUnique({ where: { tipId }, select: { counted: true, combo: { select: { userId: true } } } });
  if (!ct?.counted) return;
  await lockCreator(tx, ct.combo.userId);
  await endIfExpiredTx(tx, ct.combo.userId, now);
  const row = await tx.comboTip.findUnique({
    where: { tipId },
    select: { amount: true, comboId: true, combo: { select: { status: true, level: true, progress: true, total: true } } },
  });
  if (!row) return;
  await tx.comboTip.update({ where: { tipId }, data: { counted: false } });
  const s = row.combo.status === "ACTIVE" ? removeAmount(row.combo, row.amount) : row.combo;
  await tx.combo.update({
    where: { id: row.comboId },
    data: { total: Math.max(0, row.combo.total - row.amount), progress: s.progress },
  });
}

/** Card turned off: a running combo stops at once (no summary, no cooldown). */
export async function stopComboTx(tx: Tx, userId: string, now: Date): Promise<void> {
  await tx.combo.updateMany({ where: { userId, status: "ACTIVE" }, data: { status: "STOPPED", endedAt: now } });
}

/**
 * What the combo OBS link shows now: a pending dashboard test first; else the
 * running combo; else the summary of one that ended within SUMMARY_MS.
 */
export async function comboFeed(userId: string, now: Date): Promise<ComboFeed> {
  const test = await readComboTest(userId, now.getTime());
  if (test) return testSample(now.getTime() - test.startedAt, test.id, now.getTime());
  await prisma.$transaction(async (tx) => {
    const ended = await tx.combo.findFirst({ where: { userId, status: "ACTIVE", lastTipAt: { lte: new Date(now.getTime() - COUNTDOWN_MS) } }, select: { id: true } });
    if (!ended) return;
    await lockCreator(tx, userId);
    await endIfExpiredTx(tx, userId, now);
  });
  const combo = await prisma.combo.findFirst({
    where: {
      userId,
      OR: [{ status: "ACTIVE" }, { status: "ENDED", endedAt: { gt: new Date(now.getTime() - SUMMARY_MS) } }],
    },
    orderBy: { startedAt: "desc" },
    select: {
      id: true,
      status: true,
      level: true,
      progress: true,
      total: true,
      sizes: true,
      rewards: true,
      lastTipAt: true,
      endedAt: true,
    },
  });
  if (!combo) return { phase: "idle" };
  const view = rewardsView(combo.level, combo.rewards);
  if (combo.status === "ACTIVE") {
    return {
      phase: "running",
      id: combo.id,
      level: combo.level,
      progress: combo.progress,
      size: sizeAt(combo.sizes, combo.level),
      ...view,
      endsAt: new Date(combo.lastTipAt.getTime() + COUNTDOWN_MS).toISOString(),
    };
  }
  // Fans = names of the tips still counted (a rejected tip isn't a fan).
  const tips = await prisma.comboTip.findMany({
    where: { comboId: combo.id, counted: true },
    select: { tip: { select: { supporterName: true } } },
  });
  return {
    phase: "summary",
    id: combo.id,
    level: combo.level,
    total: combo.total,
    fans: countFans(tips.map((t) => t.tip.supporterName)),
    won: view.unlocked,
    almost: view.nextReward ? { level: combo.level + 1, text: view.nextReward } : null,
    until: new Date((combo.endedAt?.getTime() ?? now.getTime()) + SUMMARY_MS).toISOString(),
  };
}

/** The combo link was polled: remember it (at most every 30 s) so tips count while it's open. */
export async function touchComboSeen(userId: string, now: Date): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, OR: [{ comboOverlaySeenAt: null }, { comboOverlaySeenAt: { lt: new Date(now.getTime() - 30_000) } }] },
    data: { comboOverlaySeenAt: now },
  });
}
