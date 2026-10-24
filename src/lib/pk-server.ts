import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lockCreator } from "@/lib/combo-server";
import { TIP_TX } from "@/lib/tip-hooks";
import { cleanHex, cleanSideName, DEFAULT_SIDES, isPkDuration, isPkSide, winnerOf, type PkSide } from "@/lib/pk";

type Tx = Prisma.TransactionClient;

/**
 * PK server side (spec docs/superpowers/specs/2026-10-24-pk-design.md, Q1–Q12).
 * Totals are a sum over confirmed tips; nothing hooks into the tip pipeline,
 * and nothing here runs inside a tip transaction (Q3). A match's result is
 * frozen a grace period after its end, by whoever reads it first.
 */

const MATCH_SELECT = {
  id: true,
  kind: true,
  ownerId: true,
  opponentId: true,
  status: true,
  nameA: true,
  nameB: true,
  colorA: true,
  colorB: true,
  durationSec: true,
  graceSec: true,
  startedAt: true,
  endsAt: true,
  endedAt: true,
  totalA: true,
  totalB: true,
} as const;
type Match = Prisma.PkMatchGetPayload<{ select: typeof MATCH_SELECT }>;

/** A result stays on screen this long after it is frozen. */
const SHOW_RESULT_MS = 15_000;

export class PkError extends Error {
  constructor(public code: "busy" | "invalid" | "not_found" | "off") {
    super(code);
  }
}

/** Live totals of a solo match (whole baht): confirmed tips that chose a side (Q1). */
export async function soloTotals(db: Tx | typeof prisma, matchId: string): Promise<{ A: number; B: number }> {
  const rows = await db.tip.groupBy({
    by: ["pkSide"],
    where: { pkMatchId: matchId, status: "CONFIRMED", pkSide: { in: ["A", "B"] } },
    _sum: { amount: true },
  });
  const out = { A: 0, B: 0 };
  for (const r of rows) if (isPkSide(r.pkSide)) out[r.pkSide] = Math.round(Number(r._sum.amount ?? 0));
  return out;
}

async function totalsOf(db: Tx | typeof prisma, m: Match): Promise<{ A: number; B: number }> {
  if (m.kind === "solo") return soloTotals(db, m.id);
  // Creator vs creator (P9b): each creator's own confirmed tips sent in the window.
  const sum = async (creatorId: string | null) => {
    if (!creatorId || !m.startedAt || !m.endsAt) return 0;
    const r = await db.tip.aggregate({
      where: { creatorId, status: "CONFIRMED", createdAt: { gte: m.startedAt, lte: m.endsAt } },
      _sum: { amount: true },
    });
    return Math.round(Number(r._sum.amount ?? 0));
  };
  return { A: await sum(m.ownerId), B: await sum(m.opponentId) };
}

/** Lock every creator of a match in id order (never inside a tip transaction). */
async function lockCreatorsOf(tx: Tx, m: { ownerId: string | null; opponentId: string | null }) {
  const ids = [m.ownerId, m.opponentId].filter((x): x is string => Boolean(x)).sort();
  for (const id of ids) await lockCreator(tx, id);
}

/**
 * Freeze the result once the grace period is over (Q3): creator locks in id
 * order, then the match row; only an ACTIVE match past its grace is ended,
 * so two readers freeze it once with the same totals.
 */
export async function freezeIfDue(m: Match, now: Date): Promise<Match> {
  if (m.status !== "ACTIVE" || !m.endsAt) return m;
  if (now.getTime() <= m.endsAt.getTime() + m.graceSec * 1000) return m;
  return prisma.$transaction(async (tx) => {
    await lockCreatorsOf(tx, m);
    const [row] = await tx.$queryRaw<{ status: string }[]>`
      SELECT "status"::text AS "status" FROM "PkMatch" WHERE "id" = ${m.id} FOR UPDATE`;
    if (row?.status !== "ACTIVE") {
      return (await tx.pkMatch.findUnique({ where: { id: m.id }, select: MATCH_SELECT })) ?? m;
    }
    const t = await totalsOf(tx, m);
    return tx.pkMatch.update({
      where: { id: m.id },
      data: { status: "ENDED", totalA: t.A, totalB: t.B, endedAt: m.endsAt },
      select: MATCH_SELECT,
    });
  }, TIP_TX);
}

export type PkFeed = {
  id: string;
  kind: "solo" | "duo";
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
  totalA: number;
  totalB: number;
  /** ISO; the countdown uses endsAt − serverNow. */
  endsAt: string;
  serverNow: string;
  /** "live" = counting, "grace" = time is up, waiting for confirms in flight, "ended" = frozen. */
  phase: "live" | "grace" | "ended";
  winner: PkSide | "draw" | null;
};

async function toFeed(m: Match, now: Date): Promise<PkFeed> {
  const frozen = m.status === "ENDED";
  const t = frozen ? { A: m.totalA ?? 0, B: m.totalB ?? 0 } : await totalsOf(prisma, m);
  const ends = m.endsAt ?? now;
  return {
    id: m.id,
    kind: m.kind === "duo" ? "duo" : "solo",
    nameA: m.nameA,
    nameB: m.nameB,
    colorA: m.colorA,
    colorB: m.colorB,
    totalA: t.A,
    totalB: t.B,
    endsAt: ends.toISOString(),
    serverNow: now.toISOString(),
    phase: frozen ? "ended" : now < ends ? "live" : "grace",
    winner: frozen ? winnerOf(t.A, t.B) : null,
  };
}

/**
 * The match to show for a creator now: the ACTIVE one (frozen first if due),
 * or one that ended moments ago (the winner banner). `soloOnly` for the
 * public donate-page feed.
 */
export async function currentFor(userId: string, now: Date, opts: { soloOnly?: boolean } = {}): Promise<PkFeed | null> {
  const where: Prisma.PkMatchWhereInput = {
    OR: [{ ownerId: userId }, { opponentId: userId }],
    ...(opts.soloOnly ? { kind: "solo" } : {}),
  };
  let m = await prisma.pkMatch.findFirst({
    where: { ...where, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    select: MATCH_SELECT,
  });
  if (m) m = await freezeIfDue(m, now);
  if (!m || m.status !== "ACTIVE") {
    const recent = await prisma.pkMatch.findFirst({
      where: { ...where, status: "ENDED", endedAt: { not: null } },
      orderBy: { endedAt: "desc" },
      select: MATCH_SELECT,
    });
    // The banner shows for a while after the freeze (end + grace + 15 s).
    if (recent?.endedAt && now.getTime() < recent.endedAt.getTime() + recent.graceSec * 1000 + SHOW_RESULT_MS) m = recent;
    else m = null;
  }
  return m ? toFeed(m, now) : null;
}

/** Start a solo match (two sides in one stream). One match at a time (R3, Q7). */
export async function startSolo(
  userId: string,
  input: { nameA?: unknown; nameB?: unknown; colorA?: unknown; colorB?: unknown; durationSec?: unknown },
  now: Date,
): Promise<void> {
  const nameA = input.nameA === undefined ? DEFAULT_SIDES.nameA : cleanSideName(input.nameA);
  const nameB = input.nameB === undefined ? DEFAULT_SIDES.nameB : cleanSideName(input.nameB);
  const colorA = input.colorA === undefined ? DEFAULT_SIDES.colorA : cleanHex(input.colorA);
  const colorB = input.colorB === undefined ? DEFAULT_SIDES.colorB : cleanHex(input.colorB);
  if (!nameA || !nameB || !colorA || !colorB || !isPkDuration(input.durationSec)) throw new PkError("invalid");
  const durationSec = input.durationSec;
  // Freeze anything due first, so an over-time match doesn't block a new one.
  const running = await prisma.pkMatch.findMany({
    where: { OR: [{ ownerId: userId }, { opponentId: userId }], status: "ACTIVE" },
    select: MATCH_SELECT,
  });
  for (const r of running) await freezeIfDue(r, now);
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    const u = await tx.user.findUnique({ where: { id: userId }, select: { pkEnabled: true, autoConfirmTips: true } });
    if (!u?.pkEnabled) throw new PkError("off");
    const busy = await tx.pkMatch.count({ where: { OR: [{ ownerId: userId }, { opponentId: userId }], status: "ACTIVE" } });
    if (busy > 0) throw new PkError("busy");
    await tx.pkMatch.create({
      data: {
        kind: "solo",
        ownerId: userId,
        status: "ACTIVE",
        nameA,
        nameB,
        colorA,
        colorB: colorB === colorA ? DEFAULT_SIDES.colorB : colorB,
        durationSec,
        graceSec: u.autoConfirmTips ? 60 : 300,
        startedAt: now,
        endsAt: new Date(now.getTime() + durationSec * 1000),
      },
    });
  }, TIP_TX);
}

/** "จบก่อนเวลา": a running solo match ends now (its result freezes after the grace). */
export async function endEarly(userId: string, now: Date): Promise<boolean> {
  const r = await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    return tx.pkMatch.updateMany({
      where: { ownerId: userId, kind: "solo", status: "ACTIVE", endsAt: { gt: now } },
      data: { endsAt: now },
    });
  }, TIP_TX);
  return r.count > 0;
}

/**
 * Card off or account deleted (Q8, Q9): running and pending matches involving
 * the user are cancelled with their totals so far (no winner). Caller holds
 * no tip transaction; locks every creator involved in id order.
 */
export async function cancelAllFor(userId: string, now: Date): Promise<void> {
  const open = await prisma.pkMatch.findMany({
    where: { OR: [{ ownerId: userId }, { opponentId: userId }], status: { in: ["ACTIVE", "PENDING"] } },
    select: MATCH_SELECT,
  });
  for (const m of open) {
    await prisma.$transaction(async (tx) => {
      await lockCreatorsOf(tx, m);
      const t = m.status === "ACTIVE" ? await totalsOf(tx, m) : { A: 0, B: 0 };
      await tx.pkMatch.updateMany({
        where: { id: m.id, status: { in: ["ACTIVE", "PENDING"] } },
        data: { status: "CANCELLED", totalA: t.A, totalB: t.B, endedAt: now },
      });
    }, TIP_TX);
  }
}

export async function setPkEnabled(userId: string, enabled: boolean, now: Date): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { pkEnabled: enabled } });
  if (!enabled) await cancelAllFor(userId, now);
}

/**
 * A fan's side on a new tip (Q5): only for this creator's own running solo
 * match, before its end, with the card on. Anything else = no side, silently.
 */
export async function fanSide(
  creatorId: string,
  matchId: unknown,
  side: unknown,
  now: Date,
): Promise<{ pkMatchId: string; pkSide: PkSide } | null> {
  if (typeof matchId !== "string" || !isPkSide(side)) return null;
  const m = await prisma.pkMatch.findFirst({
    where: { id: matchId, ownerId: creatorId, kind: "solo", status: "ACTIVE", endsAt: { gt: now }, owner: { pkEnabled: true } },
    select: { id: true },
  });
  return m ? { pkMatchId: m.id, pkSide: side } : null;
}

/** The creator's last 10 finished or cancelled matches. */
export async function pkHistory(userId: string) {
  const rows = await prisma.pkMatch.findMany({
    where: { OR: [{ ownerId: userId }, { opponentId: userId }], status: { in: ["ENDED", "CANCELLED"] } },
    orderBy: { endedAt: "desc" },
    take: 10,
    select: { id: true, kind: true, status: true, nameA: true, nameB: true, colorA: true, colorB: true, totalA: true, totalB: true, startedAt: true, endedAt: true },
  });
  return rows.map((r) => ({
    ...r,
    startedAt: r.startedAt?.toISOString() ?? null,
    endedAt: r.endedAt?.toISOString() ?? null,
    winner: r.status === "ENDED" ? winnerOf(r.totalA ?? 0, r.totalB ?? 0) : null,
  }));
}

/** The scripted sample match for "ทดสอบบนจอ" (15 s race, then the result). */
export function testFeed(t: { id: string; startedAt: number }, now: Date): PkFeed {
  const elapsed = Math.max(0, now.getTime() - t.startedAt);
  const race = 15_000;
  const p = Math.min(1, elapsed / race);
  // Only ever goes up (like real tips); B leads early, A wins at the end.
  const totalA = Math.round(850 * p * p);
  const totalB = Math.round(780 * Math.min(1, p * 1.4));
  const ended = elapsed >= race;
  return {
    id: t.id,
    kind: "solo",
    nameA: DEFAULT_SIDES.nameA,
    nameB: DEFAULT_SIDES.nameB,
    colorA: DEFAULT_SIDES.colorA,
    colorB: DEFAULT_SIDES.colorB,
    totalA,
    totalB,
    endsAt: new Date(t.startedAt + race).toISOString(),
    serverNow: now.toISOString(),
    phase: ended ? "ended" : "live",
    winner: ended ? winnerOf(totalA, totalB) : null,
  };
}
