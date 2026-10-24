import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lockCreator } from "@/lib/combo-server";
import { TIP_TX } from "@/lib/tip-hooks";
import {
  cleanHex,
  cleanSideName,
  DEFAULT_SIDES,
  distinctColorB,
  MAX_SIDE_NAME,
  effectiveGraceSec,
  isPkDuration,
  isPkSide,
  winnerOf,
  type PkSide,
} from "@/lib/pk";

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
  owner: { select: { autoConfirmTips: true } },
  opponent: { select: { autoConfirmTips: true } },
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

/** Grace for this match now (Q4 + review): never shorter than the creator's current setting needs. */
function graceOf(m: Match): number {
  const own = effectiveGraceSec(m.graceSec, m.owner ? m.owner.autoConfirmTips : null);
  // Creator vs creator: the slower confirmer sets the pace (spec P9b).
  return m.kind === "duo" ? Math.max(own, effectiveGraceSec(m.graceSec, m.opponent ? m.opponent.autoConfirmTips : null)) : own;
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
  if (now.getTime() <= m.endsAt.getTime() + graceOf(m) * 1000) return m;
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
  /** Seconds after the end that confirms in flight still count. */
  graceSec: number;
  /** "live" = counting, "grace" = time is up, waiting for confirms in flight, "ended" = frozen. */
  phase: "live" | "grace" | "ended";
  winner: PkSide | "draw" | null;
};

async function toFeed(m: Match, now: Date, viewerId?: string): Promise<PkFeed> {
  const frozen = m.status === "ENDED";
  const t = frozen ? { A: m.totalA ?? 0, B: m.totalB ?? 0 } : await totalsOf(prisma, m);
  const ends = m.endsAt ?? now;
  const feed: PkFeed = {
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
    graceSec: graceOf(m),
    phase: frozen ? "ended" : now < ends ? "live" : "grace",
    winner: frozen ? winnerOf(t.A, t.B) : null,
  };
  // Creator vs creator: each stream shows its own creator on the left.
  if (m.kind === "duo" && viewerId && viewerId === m.opponentId) {
    return {
      ...feed,
      nameA: feed.nameB,
      nameB: feed.nameA,
      colorA: feed.colorB,
      colorB: feed.colorA,
      totalA: feed.totalB,
      totalB: feed.totalA,
      winner: feed.winner === "A" ? "B" : feed.winner === "B" ? "A" : feed.winner,
    };
  }
  return feed;
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
    if (recent?.endedAt && now.getTime() < recent.endedAt.getTime() + graceOf(recent) * 1000 + SHOW_RESULT_MS) m = recent;
    else m = null;
  }
  return m ? toFeed(m, now, userId) : null;
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
        colorB: distinctColorB(colorA, colorB),
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
  for (const found of open) {
    // A match already over (and only waiting to be read) keeps its result.
    const m = await freezeIfDue(found, now);
    if (m.status !== "ACTIVE" && m.status !== "PENDING") continue;
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
    // Matches that actually ran (withdrawn or lapsed invitations aren't results).
    where: { OR: [{ ownerId: userId }, { opponentId: userId }], status: { in: ["ENDED", "CANCELLED"] }, startedAt: { not: null } },
    orderBy: { endedAt: "desc" },
    take: 10,
    select: { id: true, kind: true, status: true, ownerId: true, opponentId: true, nameA: true, nameB: true, colorA: true, colorB: true, totalA: true, totalB: true, startedAt: true, endedAt: true },
  });
  return rows.map(({ ownerId: _o, opponentId, ...r }) => {
    void _o;
    const winner = r.status === "ENDED" ? winnerOf(r.totalA ?? 0, r.totalB ?? 0) : null;
    const base = { ...r, startedAt: r.startedAt?.toISOString() ?? null, endedAt: r.endedAt?.toISOString() ?? null, winner };
    // Creator vs creator: the viewer's own side first.
    if (r.kind === "duo" && opponentId === userId) {
      return {
        ...base,
        nameA: r.nameB,
        nameB: r.nameA,
        colorA: r.colorB,
        colorB: r.colorA,
        totalA: r.totalB,
        totalB: r.totalA,
        winner: winner === "A" ? ("B" as const) : winner === "B" ? ("A" as const) : winner,
      };
    }
    return base;
  });
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
    graceSec: 0,
    phase: ended ? "ended" : "live",
    winner: ended ? winnerOf(totalA, totalB) : null,
  };
}

// ---------------------------------------------------------------------------
// Creator vs creator (P9b, Q6–Q12). Only display names and totals cross over.

const INVITE_MS = 10 * 60_000;
const DECLINE_COOLDOWN_MS = 60 * 60_000;
const MAX_PENDING_OUT = 3;

/** Invitations older than 10 minutes lapse (on read). */
async function expireInvites(userId: string, now: Date): Promise<void> {
  await prisma.pkMatch.updateMany({
    where: {
      kind: "duo",
      status: "PENDING",
      OR: [{ ownerId: userId }, { opponentId: userId }],
      createdAt: { lt: new Date(now.getTime() - INVITE_MS) },
    },
    data: { status: "CANCELLED", endedAt: now },
  });
}

/** The two creators' locks, lower id first (never inside a tip transaction). */
async function lockPair(tx: Tx, a: string, b: string) {
  for (const id of [a, b].sort()) await lockCreator(tx, id);
}

function sideName(displayName: string): string {
  return displayName.trim().slice(0, MAX_SIDE_NAME) || "TipTang";
}

/**
 * Invite another creator by username. Generic "invalid" for anything about
 * the other creator (unknown, PK off, invites off, self) so nobody can probe.
 */
export async function inviteDuo(ownerId: string, username: unknown, durationSec: unknown, now: Date): Promise<void> {
  if (typeof username !== "string" || !isPkDuration(durationSec)) throw new PkError("invalid");
  // The inviter's own limits come first: what is said about the other
  // creator afterwards is always the same generic "invalid".
  await expireInvites(ownerId, now);
  const self = await prisma.user.findUnique({ where: { id: ownerId }, select: { pkEnabled: true } });
  if (!self?.pkEnabled) throw new PkError("off");
  if ((await prisma.pkMatch.count({ where: { ownerId, kind: "duo", status: "PENDING" } })) >= MAX_PENDING_OUT) {
    throw new PkError("busy");
  }
  const other = await prisma.user.findUnique({
    where: { username: username.trim().replace(/^@/, "").toLowerCase() },
    select: { id: true, displayName: true, alertColor: true, pkEnabled: true, pkInvitesOff: true, autoConfirmTips: true },
  });
  if (!other || other.id === ownerId || !other.pkEnabled || other.pkInvitesOff) throw new PkError("invalid");
  await prisma.$transaction(async (tx) => {
    await lockPair(tx, ownerId, other.id);
    const me = await tx.user.findUnique({
      where: { id: ownerId },
      select: { displayName: true, alertColor: true, pkEnabled: true, autoConfirmTips: true },
    });
    // Checked again under the locks; a change in between reads as generic.
    if (!me?.pkEnabled) throw new PkError("invalid");
    const pendingOut = await tx.pkMatch.count({ where: { ownerId, kind: "duo", status: "PENDING" } });
    if (pendingOut >= MAX_PENDING_OUT) throw new PkError("invalid");
    const sameOpen = await tx.pkMatch.count({
      where: { ownerId, opponentId: other.id, kind: "duo", status: { in: ["PENDING", "ACTIVE"] } },
    });
    const declined = await tx.pkMatch.count({
      where: { ownerId, opponentId: other.id, kind: "duo", status: "DECLINED", endedAt: { gt: new Date(now.getTime() - DECLINE_COOLDOWN_MS) } },
    });
    if (sameOpen > 0 || declined > 0) throw new PkError("invalid");
    const colorA = cleanHex(me.alertColor) ?? DEFAULT_SIDES.colorA;
    await tx.pkMatch.create({
      data: {
        kind: "duo",
        ownerId,
        opponentId: other.id,
        status: "PENDING",
        nameA: sideName(me.displayName),
        nameB: sideName(other.displayName),
        colorA,
        colorB: distinctColorB(colorA, cleanHex(other.alertColor) ?? DEFAULT_SIDES.colorB),
        durationSec,
        graceSec: me.autoConfirmTips && other.autoConfirmTips ? 60 : 300,
      },
    });
  }, TIP_TX);
}

/**
 * The invited creator answers. Accepting starts the match for both at once,
 * only if neither is already in a running PK (R3), and withdraws every other
 * invitation involving either of them.
 */
export async function respondDuo(userId: string, id: string, answer: "accept" | "decline", now: Date): Promise<void> {
  await expireInvites(userId, now);
  const m = await prisma.pkMatch.findFirst({
    where: { id, opponentId: userId, kind: "duo", status: "PENDING" },
    select: { id: true, ownerId: true, opponentId: true, durationSec: true },
  });
  if (!m?.ownerId || !m.opponentId) throw new PkError("not_found");
  const ownerId = m.ownerId;
  const running = await prisma.pkMatch.findMany({
    where: { status: "ACTIVE", OR: [{ ownerId: { in: [ownerId, userId] } }, { opponentId: { in: [ownerId, userId] } }] },
    select: MATCH_SELECT,
  });
  for (const r of running) await freezeIfDue(r, now);
  await prisma.$transaction(async (tx) => {
    await lockPair(tx, ownerId, userId);
    const [row] = await tx.$queryRaw<{ status: string }[]>`
      SELECT "status"::text AS "status" FROM "PkMatch" WHERE "id" = ${m.id} FOR UPDATE`;
    if (row?.status !== "PENDING") throw new PkError("not_found");
    if (answer === "decline") {
      await tx.pkMatch.update({ where: { id: m.id }, data: { status: "DECLINED", endedAt: now } });
      return;
    }
    const people = await tx.user.findMany({ where: { id: { in: [ownerId, userId] } }, select: { pkEnabled: true } });
    if (people.length !== 2 || people.some((p) => !p.pkEnabled)) throw new PkError("off");
    const busy = await tx.pkMatch.count({
      where: { status: "ACTIVE", OR: [{ ownerId: { in: [ownerId, userId] } }, { opponentId: { in: [ownerId, userId] } }] },
    });
    if (busy > 0) throw new PkError("busy");
    await tx.pkMatch.update({
      where: { id: m.id },
      data: { status: "ACTIVE", startedAt: now, endsAt: new Date(now.getTime() + m.durationSec * 1000) },
    });
    await tx.pkMatch.updateMany({
      where: {
        id: { not: m.id },
        kind: "duo",
        status: "PENDING",
        OR: [{ ownerId: { in: [ownerId, userId] } }, { opponentId: { in: [ownerId, userId] } }],
      },
      data: { status: "CANCELLED", endedAt: now },
    });
  }, TIP_TX);
}

/** Either creator withdraws an invitation or stops a running match (no winner). */
export async function cancelDuo(userId: string, id: string, now: Date): Promise<void> {
  const found = await prisma.pkMatch.findFirst({
    where: { id, kind: "duo", status: { in: ["PENDING", "ACTIVE"] }, OR: [{ ownerId: userId }, { opponentId: userId }] },
    select: MATCH_SELECT,
  });
  if (!found) throw new PkError("not_found");
  const m = await freezeIfDue(found, now);
  if (m.status !== "ACTIVE" && m.status !== "PENDING") return;
  await prisma.$transaction(async (tx) => {
    await lockCreatorsOf(tx, m);
    const t = m.status === "ACTIVE" ? await totalsOf(tx, m) : { A: 0, B: 0 };
    await tx.pkMatch.updateMany({
      where: { id: m.id, status: { in: ["PENDING", "ACTIVE"] } },
      data: { status: "CANCELLED", totalA: t.A, totalB: t.B, endedAt: now },
    });
  }, TIP_TX);
}

export type PkInvite = { id: string; name: string; durationSec: number; createdAt: string };

/** Pending invitations to and from this creator (stale ones lapse first). */
export async function invitesFor(userId: string, now: Date): Promise<{ incoming: PkInvite[]; outgoing: PkInvite[] }> {
  await expireInvites(userId, now);
  const rows = await prisma.pkMatch.findMany({
    where: { kind: "duo", status: "PENDING", OR: [{ ownerId: userId }, { opponentId: userId }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, ownerId: true, nameA: true, nameB: true, durationSec: true, createdAt: true },
  });
  const row = (r: (typeof rows)[number], name: string): PkInvite => ({
    id: r.id,
    name,
    durationSec: r.durationSec,
    createdAt: r.createdAt.toISOString(),
  });
  return {
    incoming: rows.filter((r) => r.ownerId !== userId).map((r) => row(r, r.nameA)),
    outgoing: rows.filter((r) => r.ownerId === userId).map((r) => row(r, r.nameB)),
  };
}
