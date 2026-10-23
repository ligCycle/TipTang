import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lockCreator } from "@/lib/combo-server";
import { TIP_TX } from "@/lib/tip-hooks";
import { elapsedSec, overdue, TEST_VIDEO_ID } from "@/lib/media";

type Tx = Prisma.TransactionClient;

/**
 * "ขอคลิป/เพลง" queue (spec docs/superpowers/specs/2026-10-23-media-request-design.md).
 * A clip rides on its tip: HELD until the tip is confirmed, then waits for the
 * creator (PENDING) or goes straight into the queue (APPROVED, auto-approve).
 * The server owns the queue; the OBS link only reports started/ended/error.
 * Every write runs under the creator lock (lockCreator) — lock order Tip → Wheel → User.
 */

const LIVE = ["PENDING", "APPROVED", "PLAYING"] as const;
const HISTORY_MS = 24 * 60 * 60 * 1000;
/** The media OBS link counts as connected this long after its last poll. */
export const MEDIA_SEEN_MS = 60_000;

/** Next position at the end of the queue. */
async function lastPosition(tx: Tx, userId: string): Promise<number> {
  const top = await tx.mediaRequest.aggregate({
    where: { userId, status: { in: [...LIVE] } },
    _max: { position: true },
  });
  return (top._max.position ?? 0) + 1;
}

/** A position in front of everything waiting. */
async function firstPosition(tx: Tx, userId: string): Promise<number> {
  const top = await tx.mediaRequest.aggregate({
    where: { userId, status: { in: [...LIVE] } },
    _min: { position: true },
  });
  return (top._min.position ?? 1) - 1;
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
  const user = await tx.user.findUnique({
    where: { id: req.userId },
    select: { mediaAutoApprove: true, mediaAutoAckAt: true, mediaEnabled: true },
  });
  // Straight into the queue only with the card on and auto-approve consented
  // to; otherwise (e.g. a tip confirmed days after the card went off) it waits
  // for the creator.
  const auto = Boolean(user?.mediaEnabled && user.mediaAutoApprove && user.mediaAutoAckAt);
  await tx.mediaRequest.update({
    where: { id: req.id },
    data: {
      status: auto ? "APPROVED" : "PENDING",
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

// ---------------------------------------------------------------------------
// The queue: what the OBS link plays, and what the creator does with it.

export type MediaCurrent = {
  id: string;
  videoId: string;
  title: string;
  startSec: number;
  fan: string;
  amount: number;
  /** Seconds already played (a refreshed or late source seeks here). */
  elapsedSec: number;
  test: boolean;
};

export type MediaFeed = {
  enabled: boolean;
  paused: boolean;
  volume: number;
  maxSec: number;
  color: string | null;
  current: MediaCurrent | null;
};

const ROW_SELECT = {
  id: true,
  videoId: true,
  title: true,
  startSec: true,
  status: true,
  position: true,
  tipId: true,
  promotedAt: true,
  startedAt: true,
  queuedAt: true,
  endedAt: true,
  tip: { select: { supporterName: true, amount: true } },
} as const;

type Row = Prisma.MediaRequestGetPayload<{ select: typeof ROW_SELECT }>;

/** The queue page also shows the fan's message (never sent to the overlay). */
const LIST_SELECT = {
  ...ROW_SELECT,
  tip: { select: { supporterName: true, amount: true, message: true } },
} as const;
type ListRow = Prisma.MediaRequestGetPayload<{ select: typeof LIST_SELECT }>;

function toCurrent(r: Row, now: Date): MediaCurrent {
  return {
    id: r.id,
    videoId: r.videoId,
    title: r.title,
    startSec: r.startSec,
    fan: r.tip?.supporterName ?? "",
    amount: r.tip ? Number(r.tip.amount) : 0,
    elapsedSec: elapsedSec(r.startedAt, now),
    test: r.tipId === null,
  };
}

export const MEDIA_SETTINGS_SELECT = {
  mediaEnabled: true,
  mediaPaused: true,
  mediaVolume: true,
  mediaMaxSec: true,
  mediaColor: true,
  alertColor: true,
} as const;
type MediaSettings = Prisma.UserGetPayload<{ select: typeof MEDIA_SETTINGS_SELECT }>;

/**
 * What the OBS link should play now. Fast path (no lock): the clip already
 * playing, or nothing to hand out. Only when a clip is waiting, one is
 * overdue, or the card went off mid-clip does it take the creator lock,
 * settle the playing rows and hand out the next approved one — so two open
 * sources and a dashboard skip never leave two clips playing, and an idle
 * queue costs no lock. `settings` = the caller's read of MEDIA_SETTINGS_SELECT.
 */
export async function mediaQueueCurrent(
  userId: string,
  now: Date,
  settings?: MediaSettings | null,
): Promise<MediaFeed | null> {
  const s = settings ?? (await prisma.user.findUnique({ where: { id: userId }, select: MEDIA_SETTINGS_SELECT }));
  if (!s) return null;
  const base = {
    enabled: s.mediaEnabled,
    paused: s.mediaPaused,
    volume: s.mediaVolume,
    maxSec: s.mediaMaxSec,
    color: s.mediaColor ?? s.alertColor,
  };
  const playing = await prisma.mediaRequest.findMany({
    where: { userId, status: "PLAYING" },
    orderBy: { position: "asc" },
    take: 2,
    select: ROW_SELECT,
  });
  const only = playing.length === 1 ? playing[0] : null;
  if (only && s.mediaEnabled && !overdue(only.startedAt ?? only.promotedAt, s.mediaMaxSec, now)) {
    return { ...base, current: toCurrent(only, now) };
  }
  if (playing.length === 0) {
    if (!s.mediaEnabled || s.mediaPaused) return { ...base, current: null };
    const waiting = await prisma.mediaRequest.findFirst({ where: { userId, status: "APPROVED" }, select: { id: true } });
    if (!waiting) return { ...base, current: null };
  }

  const current = await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    const fresh = await tx.user.findUnique({ where: { id: userId }, select: MEDIA_SETTINGS_SELECT });
    if (!fresh) return null;
    const rows = await tx.mediaRequest.findMany({
      where: { userId, status: "PLAYING" },
      orderBy: { position: "asc" },
      select: ROW_SELECT,
    });
    if (!fresh.mediaEnabled) {
      await requeuePlayingTx(tx, userId);
      return null;
    }
    let keep: Row | null = null;
    for (const r of rows) {
      if (keep || overdue(r.startedAt ?? r.promotedAt, fresh.mediaMaxSec, now)) {
        await tx.mediaRequest.update({ where: { id: r.id }, data: { status: "PLAYED", endedAt: now } });
      } else keep = r;
    }
    if (keep) return toCurrent(keep, now);
    if (fresh.mediaPaused) return null;
    const next = await tx.mediaRequest.findFirst({
      where: { userId, status: "APPROVED" },
      orderBy: [{ position: "asc" }, { queuedAt: "asc" }],
      select: ROW_SELECT,
    });
    if (!next) return null;
    await tx.mediaRequest.update({ where: { id: next.id }, data: { status: "PLAYING", promotedAt: now, startedAt: null } });
    return toCurrent({ ...next, startedAt: null }, now);
  }, TIP_TX);
  return { ...base, current };
}

/**
 * Card turned off: a clip playing goes back to the top of the queue, to play
 * from the start when the card is on again (creator already locked).
 */
export async function requeuePlayingTx(tx: Tx, userId: string): Promise<void> {
  const rows = await tx.mediaRequest.findMany({ where: { userId, status: "PLAYING" }, select: { id: true } });
  for (const r of rows) {
    await tx.mediaRequest.update({
      where: { id: r.id },
      data: { status: "APPROVED", promotedAt: null, startedAt: null, position: await firstPosition(tx, userId) },
    });
  }
}

/** Switch the card on or off (hub card and settings page). */
export async function setMediaEnabled(userId: string, enabled: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { mediaEnabled: enabled } });
    if (!enabled) await requeuePlayingTx(tx, userId);
  }, TIP_TX);
}

/** The OBS link reports on the clip it was given (only the playing clip counts). */
export async function mediaQueueReport(
  userId: string,
  id: string,
  event: "started" | "ended" | "error",
  now: Date,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    if (event === "started") {
      await tx.mediaRequest.updateMany({
        where: { id, userId, status: "PLAYING", startedAt: null },
        data: { startedAt: now },
      });
    } else {
      await tx.mediaRequest.updateMany({
        where: { id, userId, status: "PLAYING" },
        data: { status: "PLAYED", endedAt: now },
      });
    }
  }, TIP_TX);
}

export type MediaAction = "approve" | "remove" | "skip" | "top";
export const isMediaAction = (v: unknown): v is MediaAction =>
  v === "approve" || v === "remove" || v === "skip" || v === "top";

/** A creator's button on the queue. False = no such request in a state the action fits. */
export async function mediaQueueAction(userId: string, id: string, action: MediaAction, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    const where = { id, userId };
    let res: { count: number };
    if (action === "approve") {
      // Keeps its place (it was queued at the end, or moved up by the creator).
      res = await tx.mediaRequest.updateMany({ where: { ...where, status: "PENDING" }, data: { status: "APPROVED" } });
    } else if (action === "remove") {
      res = await tx.mediaRequest.updateMany({
        where: { ...where, status: { in: ["PENDING", "APPROVED"] } },
        data: { status: "REMOVED", endedAt: now },
      });
    } else if (action === "skip") {
      res = await tx.mediaRequest.updateMany({
        where: { ...where, status: "PLAYING" },
        data: { status: "SKIPPED", endedAt: now },
      });
    } else {
      res = await tx.mediaRequest.updateMany({
        where: { ...where, status: { in: ["PENDING", "APPROVED"] } },
        data: { position: await firstPosition(tx, userId) },
      });
    }
    return res.count > 0;
  }, TIP_TX);
}

export type MediaListRow = {
  id: string;
  videoId: string;
  title: string;
  startSec: number;
  fan: string;
  amount: number;
  message: string;
  status: string;
  test: boolean;
  queuedAt: string | null;
  endedAt: string | null;
};

/** The creator's queue page: playing, waiting for approval, up next, the last day's history. */
export async function mediaQueueList(userId: string, now: Date) {
  const rows = await prisma.mediaRequest.findMany({
    where: {
      userId,
      OR: [
        { status: { in: [...LIVE] } },
        { status: { in: ["PLAYED", "SKIPPED", "REMOVED"] }, endedAt: { gte: new Date(now.getTime() - HISTORY_MS) } },
      ],
    },
    orderBy: [{ position: "asc" }, { queuedAt: "asc" }],
    take: 300,
    select: LIST_SELECT,
  });
  const row = (r: ListRow): MediaListRow => ({
    id: r.id,
    videoId: r.videoId,
    title: r.title,
    startSec: r.startSec,
    fan: r.tip?.supporterName ?? "",
    amount: r.tip ? Number(r.tip.amount) : 0,
    message: r.tip?.message ?? "",
    status: r.status,
    test: r.tipId === null,
    queuedAt: r.queuedAt?.toISOString() ?? null,
    endedAt: r.endedAt?.toISOString() ?? null,
  });
  const done = rows
    .filter((r) => r.status === "PLAYED" || r.status === "SKIPPED" || r.status === "REMOVED")
    .sort((a, b) => (b.endedAt?.getTime() ?? 0) - (a.endedAt?.getTime() ?? 0));
  return {
    playing: rows.filter((r) => r.status === "PLAYING").map(row),
    pending: rows.filter((r) => r.status === "PENDING").map(row),
    upNext: rows.filter((r) => r.status === "APPROVED").map(row),
    history: done.slice(0, 20).map(row),
  };
}

/** "ทดสอบบนจอ": one test clip at the top of the queue (replaces an earlier test still waiting or playing). */
export async function mediaQueueTest(userId: string, now: Date): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    await tx.mediaRequest.updateMany({
      where: { userId, tipId: null, status: { in: ["APPROVED", "PLAYING"] } },
      data: { status: "REMOVED", endedAt: now },
    });
    await tx.mediaRequest.create({
      data: {
        userId,
        videoId: TEST_VIDEO_ID,
        title: "ทดสอบ",
        status: "APPROVED",
        queuedAt: now,
        position: await firstPosition(tx, userId),
      },
    });
  }, TIP_TX);
}

/** "เชื่อมต่อแล้ว" badge: note the media link's poll at most every 30 s. */
export async function touchMediaSeen(userId: string, seenAt: Date | null, now: Date): Promise<void> {
  if (seenAt && seenAt.getTime() >= now.getTime() - 30_000) return;
  await prisma.user.updateMany({
    where: { id: userId, OR: [{ mediaSeenAt: null }, { mediaSeenAt: { lt: new Date(now.getTime() - 30_000) } }] },
    data: { mediaSeenAt: now },
  });
}
