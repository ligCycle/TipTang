import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { isMediaEvent, MEDIA_SETTINGS_SELECT, mediaQueueCurrent, mediaQueueReport, touchMediaSeen } from "@/lib/media-queue";
import { ownLinkLive } from "@/lib/obs-stage";
import { viaOf } from "@/lib/obs-stage-server";

// Polled by the "ขอคลิป/เพลง" OBS link: the clip to play now (the server owns
// the queue, so every open source shows the same one). The main link sends
// via=main (stays idle while this link is in use, C4) and hold=1 while a popup
// holds its stage (nothing new starts, C1).
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  touchOverlaySeen(user);
  const now = new Date();
  const s = await prisma.user.findUnique({
    where: { id: user.id },
    select: { ...MEDIA_SETTINGS_SELECT, mediaSeenAt: true },
  });
  if (viaOf(req) === "main") {
    if (s && ownLinkLive(s.mediaSeenAt, now)) {
      return NextResponse.json({ enabled: false, paused: s.mediaPaused, volume: s.mediaVolume, maxSec: s.mediaMaxSec, color: null, current: null });
    }
  } else {
    await touchMediaSeen(user.id, s?.mediaSeenAt ?? null, now);
  }
  const hold = new URL(req.url).searchParams.get("hold") === "1";
  return NextResponse.json(await mediaQueueCurrent(user.id, now, s, { hold }));
}

// The source reports on the clip it plays: `{ id, event }` = started, ended, error,
// or paused/resumed around a popup on the main link.
export async function POST(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { id?: unknown; event?: unknown } | null;
  const event = body?.event;
  if (typeof body?.id !== "string" || !isMediaEvent(event)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await mediaQueueReport(user.id, body.id, event, new Date());
  return NextResponse.json({ ok: true });
}
