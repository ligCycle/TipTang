import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lockCreator } from "@/lib/combo-server";
import { TIP_TX } from "@/lib/tip-hooks";
import { elapsedSec, overdue, TEST_VIDEO_ID, VOICE_MAX_SEC } from "@/lib/media";
import { deleteVoices, signedSlipUrl } from "@/lib/storage";

type Tx = Prisma.TransactionClient;

/**
 * Fan media queue (specs docs/superpowers/specs/2026-10-23-media-request-design.md
 * and 2026-10-23-voice-message-design.md): "ขอคลิป/เพลง" clips and "ฝากเสียง"
 * voice messages share one queue and one OBS link, each with its own card.
 * A request rides on its tip: HELD until the tip is confirmed, then waits for
 * the creator (PENDING) or goes straight into the queue (APPROVED, auto-approve).
 * The server owns the queue; the OBS link only reports started/ended/error.
 * Every write runs under the creator lock (lockCreator) — lock order Tip → Wheel → User.
 */

export type MediaKind = "clip" | "voice";
const isKind = (v: string): v is MediaKind => v === "clip" || v === "voice";

const LIVE = ["PENDING", "APPROVED", "PLAYING"] as const;
const HISTORY_MS = 24 * 60 * 60 * 1000;
/** The media OBS link counts as connected this long after its last poll. */
export const MEDIA_SEEN_MS = 60_000;
/** "ทดสอบบนจอ" for voice: a short chime shipped with the site. */
const VOICE_TEST_URL = "/sounds/voice-test.wav";
const VOICE_TEST_SEC = 2;
/** Signed voice URLs live 10 minutes; reuse one for 9 so polls don't sign every time. */
const SIGN_TTL_SEC = 600;
const SIGN_REUSE_MS = 9 * 60 * 1000;
const signed = new Map<string, { url: string; until: number }>();

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
 * The tip became CONFIRMED (tip pipeline, creator already locked). A held
 * request joins the queue; one rejected before it started joins again; one
 * rejected after it started counts as played (never replays from the start);
 * a voice whose file was already purged can't play any more.
 */
export async function mediaQueueConfirmTx(tx: Tx, tipId: string, now: Date): Promise<void> {
  const req = await tx.mediaRequest.findUnique({
    where: { tipId },
    select: { id: true, userId: true, kind: true, status: true, startedAt: true, audioPurgedAt: true },
  });
  if (!req) return;
  if (req.status === "CANCELLED" && req.startedAt) {
    await tx.mediaRequest.update({ where: { id: req.id }, data: { status: "PLAYED", endedAt: req.startedAt } });
    return;
  }
  if (req.status !== "HELD" && req.status !== "CANCELLED") return;
  if (req.kind === "voice" && req.audioPurgedAt) {
    await tx.mediaRequest.update({ where: { id: req.id }, data: { status: "REMOVED", endedAt: now } });
    return;
  }
  const user = await tx.user.findUnique({
    where: { id: req.userId },
    select: {
      mediaAutoApprove: true,
      mediaAutoAckAt: true,
      mediaEnabled: true,
      voiceAutoApprove: true,
      voiceAutoAckAt: true,
      voiceEnabled: true,
    },
  });
  // Straight into the queue only with the card on and its auto-approve
  // consented to; otherwise (e.g. a tip confirmed days after the card went
  // off) it waits for the creator.
  const auto =
    req.kind === "voice"
      ? Boolean(user?.voiceEnabled && user.voiceAutoApprove && user.voiceAutoAckAt)
      : Boolean(user?.mediaEnabled && user.mediaAutoApprove && user.mediaAutoAckAt);
  await tx.mediaRequest.update({
    where: { id: req.id },
    data: {
      status: auto ? "APPROVED" : "PENDING",
      queuedAt: now,
      position: await lastPosition(tx, req.userId),
      promotedAt: null,
      endedAt: null,
    },
  });
}

/** A confirmed tip was rejected: its request leaves the queue (a playing one stops on the next poll). */
export async function mediaQueueRejectTx(tx: Tx, tipId: string, now: Date): Promise<void> {
  await tx.mediaRequest.updateMany({
    where: { tipId, status: { in: ["HELD", "PENDING", "APPROVED", "PLAYING"] } },
    // endedAt: the voice file's 7 days count from here.
    data: { status: "CANCELLED", endedAt: now },
  });
}

// ---------------------------------------------------------------------------
// The queue: what the OBS link plays, and what the creator does with it.

export type MediaCurrent = {
  id: string;
  kind: MediaKind;
  /** Clip only. */
  videoId: string | null;
  title: string;
  startSec: number;
  /** Voice only: playable URL (signed, short-lived). */
  audioUrl: string | null;
  /** Voice only: length the fan's browser measured. */
  durationSec: number | null;
  /** Longest this request may play. */
  maxSec: number;
  fan: string;
  amount: number;
  /** Seconds already played (a refreshed or late clip source seeks here). */
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
  kind: true,
  videoId: true,
  title: true,
  startSec: true,
  audioKey: true,
  durationSec: true,
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

export const MEDIA_SETTINGS_SELECT = {
  mediaEnabled: true,
  voiceEnabled: true,
  mediaPaused: true,
  mediaVolume: true,
  mediaMaxSec: true,
  mediaColor: true,
  alertColor: true,
} as const;
type MediaSettings = Prisma.UserGetPayload<{ select: typeof MEDIA_SETTINGS_SELECT }>;

const kindOf = (r: { kind: string }): MediaKind => (isKind(r.kind) ? r.kind : "clip");
const cardOn = (s: MediaSettings, kind: MediaKind) => (kind === "voice" ? s.voiceEnabled : s.mediaEnabled);
const kindsOn = (s: MediaSettings): MediaKind[] =>
  (["clip", "voice"] as const).filter((k) => cardOn(s, k));
const limitOf = (s: MediaSettings, kind: MediaKind) => (kind === "voice" ? VOICE_MAX_SEC : s.mediaMaxSec);

async function voiceUrl(r: Row, now: Date): Promise<string | null> {
  if (r.tipId === null) return VOICE_TEST_URL;
  if (!r.audioKey) return null;
  const hit = signed.get(r.id);
  if (hit && hit.until > now.getTime()) return hit.url;
  const url = await signedSlipUrl(r.audioKey, SIGN_TTL_SEC).catch(() => null);
  if (url) signed.set(r.id, { url, until: now.getTime() + SIGN_REUSE_MS });
  return url;
}

async function toCurrent(r: Row, s: MediaSettings, now: Date): Promise<MediaCurrent> {
  const kind = kindOf(r);
  return {
    id: r.id,
    kind,
    videoId: r.videoId,
    title: r.title,
    startSec: r.startSec,
    audioUrl: kind === "voice" ? await voiceUrl(r, now) : null,
    durationSec: kind === "voice" ? (r.tipId === null ? VOICE_TEST_SEC : r.durationSec) : null,
    maxSec: limitOf(s, kind),
    fan: r.tip?.supporterName ?? "",
    amount: r.tip ? Number(r.tip.amount) : 0,
    elapsedSec: elapsedSec(r.startedAt, now),
    test: r.tipId === null,
  };
}

/**
 * What the OBS link should play now. Fast path (no lock): the request already
 * playing, or nothing to hand out. Only when one is waiting, one is overdue,
 * or its card went off mid-play does it take the creator lock, settle the
 * playing rows and hand out the next approved one whose card is on — so two
 * open sources and a dashboard skip never leave two playing, and an idle
 * queue costs no lock. `settings` = the caller's read of MEDIA_SETTINGS_SELECT.
 */
export async function mediaQueueCurrent(
  userId: string,
  now: Date,
  settings?: MediaSettings | null,
): Promise<MediaFeed | null> {
  const s = settings ?? (await prisma.user.findUnique({ where: { id: userId }, select: MEDIA_SETTINGS_SELECT }));
  if (!s) return null;
  const on = kindsOn(s);
  const base = {
    enabled: on.length > 0,
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
  if (only && cardOn(s, kindOf(only)) && !overdue(only.startedAt ?? only.promotedAt, limitOf(s, kindOf(only)), now)) {
    return { ...base, current: await toCurrent(only, s, now) };
  }
  if (playing.length === 0) {
    if (on.length === 0 || s.mediaPaused) return { ...base, current: null };
    const waiting = await prisma.mediaRequest.findFirst({
      where: { userId, status: "APPROVED", kind: { in: on } },
      select: { id: true },
    });
    if (!waiting) return { ...base, current: null };
  }

  const picked = await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    const fresh = await tx.user.findUnique({ where: { id: userId }, select: MEDIA_SETTINGS_SELECT });
    if (!fresh) return null;
    const rows = await tx.mediaRequest.findMany({
      where: { userId, status: "PLAYING" },
      orderBy: { position: "asc" },
      select: ROW_SELECT,
    });
    let keep: Row | null = null;
    for (const r of rows) {
      const kind = kindOf(r);
      if (!cardOn(fresh, kind)) {
        // Its card went off mid-play: back to the top, from the start.
        await tx.mediaRequest.update({
          where: { id: r.id },
          data: { status: "APPROVED", promotedAt: null, startedAt: null, position: await firstPosition(tx, userId) },
        });
      } else if (keep || overdue(r.startedAt ?? r.promotedAt, limitOf(fresh, kind), now)) {
        await tx.mediaRequest.update({ where: { id: r.id }, data: { status: "PLAYED", endedAt: now } });
      } else keep = r;
    }
    if (keep) return { row: keep, s: fresh };
    const freshOn = kindsOn(fresh);
    if (fresh.mediaPaused || freshOn.length === 0) return null;
    const next = await tx.mediaRequest.findFirst({
      where: { userId, status: "APPROVED", kind: { in: freshOn } },
      orderBy: [{ position: "asc" }, { queuedAt: "asc" }],
      select: ROW_SELECT,
    });
    if (!next) return null;
    await tx.mediaRequest.update({ where: { id: next.id }, data: { status: "PLAYING", promotedAt: now, startedAt: null } });
    return { row: { ...next, startedAt: null }, s: fresh };
  }, TIP_TX);
  return { ...base, current: picked ? await toCurrent(picked.row, picked.s, now) : null };
}

/**
 * A card turned off: what it was playing goes back to the top of the queue,
 * to play from the start when it is on again (creator already locked).
 */
export async function requeuePlayingTx(tx: Tx, userId: string, kind?: MediaKind): Promise<void> {
  const rows = await tx.mediaRequest.findMany({
    where: { userId, status: "PLAYING", ...(kind ? { kind } : {}) },
    select: { id: true },
  });
  for (const r of rows) {
    await tx.mediaRequest.update({
      where: { id: r.id },
      data: { status: "APPROVED", promotedAt: null, startedAt: null, position: await firstPosition(tx, userId) },
    });
  }
}

/** Switch the clip card on or off (hub card and settings page). */
export async function setMediaEnabled(userId: string, enabled: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { mediaEnabled: enabled } });
    if (!enabled) await requeuePlayingTx(tx, userId, "clip");
  }, TIP_TX);
}

/** Switch the voice card on or off (hub card and settings page). */
export async function setVoiceEnabled(userId: string, enabled: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { voiceEnabled: enabled } });
    if (!enabled) await requeuePlayingTx(tx, userId, "voice");
  }, TIP_TX);
}

/** The OBS link reports on the request it was given (only the playing one counts). */
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

/**
 * A creator's button on the queue. False = no such request in a state the
 * action fits. Removing a voice message deletes its file at once.
 */
export async function mediaQueueAction(userId: string, id: string, action: MediaAction, now: Date): Promise<boolean> {
  const done = await prisma.$transaction(async (tx) => {
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
  if (done && action === "remove") await purgeVoiceNow(userId, id, now);
  return done;
}

/** Delete one voice file now (creator removed it); the row stays, marked purged. */
async function purgeVoiceNow(userId: string, id: string, now: Date): Promise<void> {
  const row = await prisma.mediaRequest.findFirst({ where: { id, userId, kind: "voice" }, select: { audioKey: true } });
  if (!row?.audioKey) return;
  if (await deleteVoices([row.audioKey])) {
    signed.delete(id);
    await prisma.mediaRequest.update({ where: { id }, data: { audioKey: null, audioPurgedAt: now } });
  }
}

export type MediaListRow = {
  id: string;
  kind: MediaKind;
  videoId: string | null;
  title: string;
  startSec: number;
  durationSec: number | null;
  /** Voice: a file to listen to is still there. */
  hasAudio: boolean;
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
    kind: kindOf(r),
    videoId: r.videoId,
    title: r.title,
    startSec: r.startSec,
    durationSec: r.tipId === null && r.kind === "voice" ? VOICE_TEST_SEC : r.durationSec,
    hasAudio: r.kind === "voice" && (r.audioKey !== null || r.tipId === null),
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

/** Where the creator listens to a voice message before approving it (owner only). */
export async function mediaQueueListenUrl(userId: string, id: string): Promise<string | null> {
  const row = await prisma.mediaRequest.findFirst({
    where: { id, userId, kind: "voice" },
    select: { audioKey: true, tipId: true },
  });
  if (!row) return null;
  if (row.tipId === null) return VOICE_TEST_URL;
  if (!row.audioKey) return null;
  return signedSlipUrl(row.audioKey, 60).catch(() => null);
}

/** "ทดสอบบนจอ": one test request at the top of the queue (replaces an earlier test still waiting or playing). */
export async function mediaQueueTest(userId: string, now: Date, kind: MediaKind = "clip"): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, userId);
    await tx.mediaRequest.updateMany({
      where: { userId, tipId: null, status: { in: ["APPROVED", "PLAYING"] } },
      data: { status: "REMOVED", endedAt: now },
    });
    await tx.mediaRequest.create({
      data: {
        userId,
        kind,
        videoId: kind === "clip" ? TEST_VIDEO_ID : null,
        title: "",
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

// ---------------------------------------------------------------------------
// Retention: voice files are personal data (spec "Retention / privacy").

const VOICE_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const VOICE_MAX_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Daily (purge-slips cron): delete voice files 7 days after the request
 * finished (played, skipped, removed, rejected), or 30 days after it was sent
 * whatever happened. Rows stay, marked purged. Returns how many were removed.
 */
export async function purgeOldVoices(now: Date, batch = 200): Promise<number> {
  const done = new Date(now.getTime() - VOICE_KEEP_MS);
  const any = new Date(now.getTime() - VOICE_MAX_KEEP_MS);
  const rows = await prisma.mediaRequest.findMany({
    where: {
      kind: "voice",
      audioKey: { not: null },
      OR: [
        { status: { in: ["PLAYED", "SKIPPED", "REMOVED", "CANCELLED"] }, endedAt: { lt: done } },
        { createdAt: { lt: any } },
      ],
    },
    take: batch,
    select: { id: true, audioKey: true },
  });
  if (rows.length === 0) return 0;
  if (!(await deleteVoices(rows.map((r) => r.audioKey)))) {
    console.error("[purge-voices] private bucket delete failed");
    return 0;
  }
  for (const r of rows) signed.delete(r.id);
  await prisma.mediaRequest.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { audioKey: null, audioPurgedAt: now },
  });
  return rows.length;
}
