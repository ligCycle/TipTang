import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isMaxSec } from "@/lib/media";
import { mediaQueueList, mediaQueueTest, MEDIA_SEEN_MS, setMediaEnabled, setVoiceEnabled } from "@/lib/media-queue";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Everything the "ขอคลิป/เพลง" settings page shows: settings, queue, connection. */
async function state(userId: string) {
  const now = new Date();
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      mediaEnabled: true,
      mediaMinAmount: true,
      mediaMaxSec: true,
      mediaAutoApprove: true,
      mediaAutoAckAt: true,
      mediaVolume: true,
      mediaPaused: true,
      mediaSeenAt: true,
      mediaColor: true,
      alertColor: true,
      minTipAmount: true,
      voiceEnabled: true,
      voiceMinAmount: true,
      voiceAutoApprove: true,
      voiceAutoAckAt: true,
    },
  });
  if (!u) return null;
  return {
    username: u.username,
    enabled: u.mediaEnabled,
    minAmount: u.mediaMinAmount,
    maxSec: u.mediaMaxSec,
    autoApprove: u.mediaAutoApprove,
    autoAcked: u.mediaAutoAckAt !== null,
    volume: u.mediaVolume,
    paused: u.mediaPaused,
    color: u.mediaColor,
    alertColor: u.alertColor,
    creatorMin: u.minTipAmount,
    voice: {
      enabled: u.voiceEnabled,
      minAmount: u.voiceMinAmount,
      autoApprove: u.voiceAutoApprove,
      autoAcked: u.voiceAutoAckAt !== null,
    },
    live: Boolean(u.mediaSeenAt && u.mediaSeenAt.getTime() >= now.getTime() - MEDIA_SEEN_MS),
    queue: await mediaQueueList(userId, now),
  };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await state(user.id);
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(s);
}

const intIn = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Change any of `{ enabled, minAmount, maxSec, autoApprove, ack, volume,
 * paused, color }`. Auto-approve needs the copyright warning confirmed once:
 * the first `autoApprove: true` must carry `ack: true` (the dialog's tick).
 */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const bad = () => NextResponse.json({ error: "invalid" }, { status: 400 });

  const data: {
    mediaEnabled?: boolean;
    mediaMinAmount?: number;
    mediaMaxSec?: number;
    mediaAutoApprove?: boolean;
    mediaAutoAckAt?: Date;
    mediaVolume?: number;
    mediaPaused?: boolean;
    mediaColor?: string | null;
    voiceMinAmount?: number;
    voiceAutoApprove?: boolean;
    voiceAutoAckAt?: Date;
  } = {};
  let enabled: boolean | undefined;
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return bad();
    enabled = body.enabled;
  }
  if (body.minAmount !== undefined) {
    if (!intIn(body.minAmount, 1, 100_000)) return bad();
    data.mediaMinAmount = body.minAmount;
  }
  if (body.maxSec !== undefined) {
    if (!isMaxSec(body.maxSec)) return bad();
    data.mediaMaxSec = body.maxSec;
  }
  if (body.volume !== undefined) {
    if (!intIn(body.volume, 0, 100)) return bad();
    data.mediaVolume = body.volume;
  }
  if (body.paused !== undefined) {
    if (typeof body.paused !== "boolean") return bad();
    data.mediaPaused = body.paused;
  }
  if (body.color !== undefined) {
    if (body.color !== null && (typeof body.color !== "string" || !HEX.test(body.color))) return bad();
    data.mediaColor = body.color;
  }
  if (body.autoApprove !== undefined) {
    if (typeof body.autoApprove !== "boolean") return bad();
    data.mediaAutoApprove = body.autoApprove;
    if (body.autoApprove) {
      if (body.ack === true) data.mediaAutoAckAt = new Date();
      else {
        const u = await prisma.user.findUnique({ where: { id: user.id }, select: { mediaAutoAckAt: true } });
        if (!u?.mediaAutoAckAt) return NextResponse.json({ error: "ack_required" }, { status: 409 });
      }
    }
  }
  // "ฝากเสียง": its own switch, minimum and auto-approve (with its own warning).
  let voiceEnabled: boolean | undefined;
  if (body.voiceEnabled !== undefined) {
    if (typeof body.voiceEnabled !== "boolean") return bad();
    voiceEnabled = body.voiceEnabled;
  }
  if (body.voiceMinAmount !== undefined) {
    if (!intIn(body.voiceMinAmount, 1, 100_000)) return bad();
    data.voiceMinAmount = body.voiceMinAmount;
  }
  if (body.voiceAutoApprove !== undefined) {
    if (typeof body.voiceAutoApprove !== "boolean") return bad();
    data.voiceAutoApprove = body.voiceAutoApprove;
    if (body.voiceAutoApprove) {
      if (body.voiceAck === true) data.voiceAutoAckAt = new Date();
      else {
        const u = await prisma.user.findUnique({ where: { id: user.id }, select: { voiceAutoAckAt: true } });
        if (!u?.voiceAutoAckAt) return NextResponse.json({ error: "voice_ack_required" }, { status: 409 });
      }
    }
  }
  await prisma.user.update({ where: { id: user.id }, data });
  if (voiceEnabled !== undefined) await setVoiceEnabled(user.id, voiceEnabled);
  // On/off goes through the queue (a clip playing goes back to the top).
  if (enabled !== undefined) await setMediaEnabled(user.id, enabled);
  return NextResponse.json(await state(user.id));
}

/** `{ action: "test", kind? }`: a test clip or voice at the top of the queue ("ทดสอบบนจอ"). */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: unknown; kind?: unknown } | null;
  if (body?.action !== "test") return NextResponse.json({ error: "invalid" }, { status: 400 });
  await mediaQueueTest(user.id, new Date(), body.kind === "voice" ? "voice" : "clip");
  return NextResponse.json(await state(user.id));
}
