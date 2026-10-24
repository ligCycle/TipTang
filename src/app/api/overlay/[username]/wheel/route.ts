import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { nextOverlaySpin } from "@/lib/wheel-server";
import { ownLinkLiveFor, touchSeen, viaOf } from "@/lib/obs-stage-server";

// Polled by the wheel OBS link. Each call hands out (and claims) at most one
// spin, so two open sources never both animate the same result. The main link
// (via=main) stays idle while the wheel's own link is in use (C4).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  touchOverlaySeen(user);
  const now = new Date();
  if (viaOf(req) === "main") {
    if (await ownLinkLiveFor(user.id, "wheel", now)) return NextResponse.json({ spin: null });
  } else {
    const u = await prisma.user.findUnique({ where: { id: user.id }, select: { wheelSeenAt: true } });
    await touchSeen(user.id, "wheelSeenAt", u?.wheelSeenAt ?? null, now);
  }
  return NextResponse.json({ spin: await nextOverlaySpin(user.id) });
}
