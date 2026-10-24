import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readBossTest } from "@/lib/overlay-test";
import { LIVE_MS } from "@/lib/combo";
import { baht, lockCreator } from "@/lib/combo-server";
import {
  applyDamage,
  bossTestFeed,
  CHAIN_AT,
  fanName,
  topDamage,
  undoDamage,
  type BossFeed,
  type BossKillView,
} from "@/lib/boss";
import { TIP_TX } from "@/lib/tip-hooks";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** A kill waits this long for the OBS link to play it; older ones are marked played (C9). */
export const KILL_PLAY_MS = 10 * 60_000;

const DEF_SELECT = { id: true, name: true, hp: true, reward: true, imageUrl: true, position: true } as const;
export type BossDefRow = { id: string; name: string; hp: number; reward: string; imageUrl: string | null; position: number };

/** The creator's live boss list, in run order. */
export async function liveDefs(db: Db, userId: string): Promise<BossDefRow[]> {
  return db.bossDef.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: DEF_SELECT,
  });
}

/**
 * Which boss of the live list is current: the pointer when it's live; at the
 * start of a run the first one; if the pointer's boss was deleted, the next
 * one after it by position, else the last (C4). −1 when the list is empty.
 */
export async function currentIndex(db: Db, userId: string, defs: BossDefRow[], bossDefId: string | null): Promise<number> {
  if (defs.length === 0) return -1;
  if (!bossDefId) return 0;
  const i = defs.findIndex((d) => d.id === bossDefId);
  if (i >= 0) return i;
  const gone = await db.bossDef.findFirst({ where: { id: bossDefId, userId }, select: { position: true } });
  if (!gone) return 0;
  const next = defs.findIndex((d) => d.position > gone.position);
  return next >= 0 ? next : defs.length - 1;
}

/**
 * A tip just became CONFIRMED (inside the pipeline, under the creator lock).
 * Counts only with the card on and the boss link open. Damage runs over
 * [current, next…, last] with overkill carrying on (R4); each defeated life
 * gets a BossKill. A re-confirmed tip deals only what it hasn't dealt already
 * to bosses that stayed dead (C2); a repeated confirm does nothing.
 */
export async function bossConfirmTx(tx: Tx, tipId: string, now: Date): Promise<void> {
  const tip = await tx.tip.findUnique({
    where: { id: tipId },
    select: { creatorId: true, amount: true, status: true, supporterName: true, bossHits: { select: { amount: true, counted: true } } },
  });
  if (!tip || tip.status !== "CONFIRMED" || tip.bossHits.some((h) => h.counted)) return;
  const userId = tip.creatorId;
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { bossEnabled: true, bossSeenAt: true, bossRun: true, bossLife: true, bossDamage: true, bossDefId: true },
  });
  const live = Boolean(user?.bossSeenAt && user.bossSeenAt.getTime() >= now.getTime() - LIVE_MS);
  if (!user?.bossEnabled || !live) return;
  const defs = await liveDefs(tx, userId);
  if (defs.length === 0) return;
  const kept = tip.bossHits.reduce((s, h) => s + h.amount, 0);
  const amount = baht(tip.amount) - kept;
  if (amount <= 0) return;

  const slice = defs.slice(await currentIndex(tx, userId, defs, user.bossDefId));
  const defAt = (i: number) => slice[Math.min(i, slice.length - 1)];
  const r = applyDamage({ life: 0, damage: user.bossDamage }, amount, slice.map((d) => d.hp));
  if (r.pieces.length === 0 && r.kills.length === 0) return;
  const fan = tip.supporterName.trim();
  if (r.pieces.length > 0) {
    await tx.bossHit.createMany({
      data: r.pieces.map((p) => ({
        userId,
        tipId,
        run: user.bossRun,
        life: user.bossLife + p.life,
        amount: p.amount,
        fan,
        createdAt: now,
      })),
    });
  }
  if (r.kills.length > 0) {
    const lives = r.kills.map((k) => user.bossLife + k);
    const hits = await tx.bossHit.findMany({
      where: { userId, run: user.bossRun, life: { in: lives } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { life: true, fan: true, amount: true },
    });
    await tx.bossKill.createMany({
      data: r.kills.map((k) => {
        const life = user.bossLife + k;
        const d = defAt(k);
        const top = topDamage(hits.filter((h) => h.life === life)) ?? { fan: fanName(fan), amount: 0 };
        return {
          userId,
          run: user.bossRun,
          life,
          bossName: d.name,
          hp: d.hp,
          reward: d.reward,
          imageUrl: d.imageUrl,
          killer: fanName(fan),
          topFan: top.fan,
          topAmount: top.amount,
          killedAt: now,
        };
      }),
      skipDuplicates: true,
    });
  }
  await tx.user.update({
    where: { id: userId },
    data: { bossLife: user.bossLife + r.life, bossDamage: r.damage, bossDefId: defAt(r.life).id },
  });
}

/**
 * A counted tip was rejected (under the creator lock): its damage on the
 * current boss comes off (floor 0); bosses it helped defeat stay dead (B2).
 */
export async function bossRejectTx(tx: Tx, tipId: string): Promise<void> {
  const hits = await tx.bossHit.findMany({
    where: { tipId, counted: true },
    select: { id: true, userId: true, run: true, life: true, amount: true },
  });
  if (hits.length === 0) return;
  const user = await tx.user.findUnique({
    where: { id: hits[0].userId },
    select: { bossRun: true, bossLife: true, bossDamage: true },
  });
  if (!user) return;
  const onCurrent = hits.filter((h) => h.run === user.bossRun && h.life === user.bossLife);
  if (onCurrent.length > 0) await tx.bossHit.deleteMany({ where: { id: { in: onCurrent.map((h) => h.id) } } });
  await tx.bossHit.updateMany({ where: { tipId, counted: true }, data: { counted: false } });
  const s = undoDamage({ life: user.bossLife, damage: user.bossDamage }, onCurrent);
  if (s.damage !== user.bossDamage) {
    await tx.user.update({ where: { id: hits[0].userId }, data: { bossDamage: s.damage } });
  }
}

/** Kills nobody has played yet are marked played (reset, card off). */
async function dropUnplayedTx(tx: Tx, userId: string, now: Date) {
  await tx.bossKill.updateMany({ where: { userId, playedAt: null }, data: { playedAt: now } });
}

/** "เริ่มใหม่ที่บอสตัวแรก": a new run from boss 1, damage cleared; history and to-do items stay (C3). */
export async function resetBoss(userId: string, now: Date): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    await tx.user.update({
      where: { id: userId },
      data: { bossRun: { increment: 1 }, bossLife: 0, bossDamage: 0, bossDefId: null },
    });
    await dropUnplayedTx(tx, userId, now);
  }, TIP_TX);
}

/** Hub toggle. Off keeps the run where it is and drops kills not played yet (C10). */
export async function setBossEnabled(userId: string, enabled: boolean, now: Date): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { bossEnabled: enabled } });
    if (!enabled) await dropUnplayedTx(tx, userId, now);
  }, TIP_TX);
}

/**
 * Delete a boss (soft). If it was the current one, the next boss after it
 * becomes current, else the last; damage dealt so far is kept (B5, C4).
 */
export async function deleteDef(userId: string, id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    const def = await tx.bossDef.findFirst({ where: { id, userId, deletedAt: null }, select: { position: true } });
    if (!def) return false;
    await tx.bossDef.update({ where: { id }, data: { deletedAt: new Date() } });
    const user = await tx.user.findUnique({ where: { id: userId }, select: { bossDefId: true } });
    if (user?.bossDefId === id) {
      const rest = await liveDefs(tx, userId);
      const next = rest.find((d) => d.position > def.position) ?? rest.at(-1);
      if (next) await tx.user.update({ where: { id: userId }, data: { bossDefId: next.id } });
    }
    return true;
  }, TIP_TX);
}

function killView(k: {
  id: string;
  bossName: string;
  hp: number;
  reward: string;
  imageUrl: string | null;
  killer: string;
  topFan: string;
  topAmount: number;
}): BossKillView {
  return {
    id: k.id,
    bossName: k.bossName,
    hp: k.hp,
    reward: k.reward,
    imageUrl: k.imageUrl,
    killer: k.killer,
    topFan: k.topFan,
    topAmount: k.topAmount,
  };
}

const KILL_SELECT = {
  id: true,
  bossName: true,
  hp: true,
  reward: true,
  imageUrl: true,
  killer: true,
  topFan: true,
  topAmount: true,
} as const;

/**
 * What the boss OBS link shows: a pending dashboard test first; else the
 * current boss, plus the next kill to play (claimed once across sources) or,
 * when more than CHAIN_AT are waiting, one summary of all of them (C9).
 */
export async function bossFeed(userId: string, now: Date, opts: { testOnly?: boolean } = {}): Promise<BossFeed> {
  const test = await readBossTest(userId, now.getTime());
  if (test) return bossTestFeed(test, now.getTime());
  if (opts.testOnly) return { phase: "off" };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bossRun: true, bossLife: true, bossDamage: true, bossDefId: true },
  });
  if (!user) return { phase: "off" };
  const defs = await liveDefs(prisma, userId);
  const idx = await currentIndex(prisma, userId, defs, user.bossDefId);
  if (idx < 0) return { phase: "off" };
  const d = defs[idx];

  await prisma.bossKill.updateMany({
    where: { userId, playedAt: null, killedAt: { lt: new Date(now.getTime() - KILL_PLAY_MS) } },
    data: { playedAt: now },
  });
  const waiting = await prisma.bossKill.findMany({
    where: { userId, playedAt: null },
    orderBy: [{ killedAt: "asc" }, { run: "asc" }, { life: "asc" }],
    take: 200,
    select: KILL_SELECT,
  });
  let kill: BossKillView | null = null;
  let chain: { id: string; count: number; lastKiller: string } | null = null;
  let claimed = 0;
  if (waiting.length > CHAIN_AT) {
    const r = await prisma.bossKill.updateMany({
      where: { id: { in: waiting.map((w) => w.id) }, playedAt: null },
      data: { playedAt: now },
    });
    claimed = waiting.length;
    const last = waiting[waiting.length - 1];
    if (r.count > 0) chain = { id: last.id, count: r.count, lastKiller: last.killer };
  } else if (waiting.length > 0) {
    const w = waiting[0];
    const r = await prisma.bossKill.updateMany({ where: { id: w.id, playedAt: null }, data: { playedAt: now } });
    claimed = 1;
    if (r.count > 0) kill = killView(w);
  }
  return {
    phase: "live",
    run: user.bossRun,
    life: user.bossLife,
    bossDefId: d.id,
    boss: { id: d.id, name: d.name, imageUrl: d.imageUrl, hp: d.hp, damage: user.bossDamage, index: idx + 1, total: defs.length },
    kill,
    chain,
    pending: Math.max(0, waiting.length - claimed),
  };
}

/** The boss link was polled: remember it (at most every 30 s) so tips count while it's open. */
export async function touchBossSeen(userId: string, seenAt: Date | null, now: Date): Promise<void> {
  if (seenAt && seenAt.getTime() >= now.getTime() - 30_000) return;
  await prisma.user.updateMany({
    where: { id: userId, OR: [{ bossSeenAt: null }, { bossSeenAt: { lt: new Date(now.getTime() - 30_000) } }] },
    data: { bossSeenAt: now },
  });
}

/** Everything the boss settings page shows. */
export async function bossSettings(userId: string) {
  const now = new Date();
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      bossEnabled: true,
      bossColor: true,
      alertColor: true,
      bossSeenAt: true,
      bossRun: true,
      bossLife: true,
      bossDamage: true,
      bossDefId: true,
    },
  });
  if (!u) return null;
  const bosses = await liveDefs(prisma, userId);
  const idx = await currentIndex(prisma, userId, bosses, u.bossDefId);
  const kills = await prisma.bossKill.findMany({
    where: { userId },
    orderBy: [{ killedAt: "desc" }, { life: "desc" }],
    take: 10,
    select: { ...KILL_SELECT, killedAt: true },
  });
  return {
    enabled: u.bossEnabled,
    color: u.bossColor,
    alertColor: u.alertColor,
    live: Boolean(u.bossSeenAt && u.bossSeenAt.getTime() >= now.getTime() - LIVE_MS),
    bosses,
    current: idx < 0 ? null : { id: bosses[idx].id, index: idx + 1, damage: u.bossDamage, defeated: u.bossLife },
    kills: kills.map((k) => ({ ...killView(k), killedAt: k.killedAt.toISOString() })),
  };
}

/** Boss rewards for the shared to-do list (only kills with a reward). */
export async function bossTodoRows(userId: string, status: "open" | "done", take: number, doneSince: Date) {
  return prisma.bossKill.findMany({
    where: { userId, reward: { not: "" }, doneAt: status === "open" ? null : { gte: doneSince } },
    orderBy: status === "open" ? { killedAt: "asc" } : { doneAt: "desc" },
    take,
    select: { id: true, bossName: true, reward: true, killer: true, topFan: true, topAmount: true, killedAt: true, doneAt: true },
  });
}
