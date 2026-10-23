import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { mediaQueueCurrent, mediaQueueReport, touchMediaSeen } from "@/lib/media-queue";

// Polled by the "ขอคลิป/เพลง" OBS link: the clip to play now (the server owns
// the queue, so every open source shows the same one).
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  touchOverlaySeen(user);
  const now = new Date();
  const seen = await prisma.user.findUnique({ where: { id: user.id }, select: { mediaSeenAt: true } });
  await touchMediaSeen(user.id, seen?.mediaSeenAt ?? null, now);
  return NextResponse.json(await mediaQueueCurrent(user.id, now));
}

// The source reports on the clip it plays: `{ id, event: "started" | "ended" | "error" }`.
export async function POST(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { id?: unknown; event?: unknown } | null;
  const event = body?.event;
  if (typeof body?.id !== "string" || (event !== "started" && event !== "ended" && event !== "error")) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await mediaQueueReport(user.id, body.id, event, new Date());
  return NextResponse.json({ ok: true });
}
