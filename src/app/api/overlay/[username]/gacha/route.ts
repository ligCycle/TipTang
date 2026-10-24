import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { nextOverlayPull } from "@/lib/gacha-server";
import { ownLinksOf, touchSeen, viaOf } from "@/lib/obs-stage-server";

// Polled by the gacha OBS link. Each call hands out (and claims) at most one
// pull, so two open sources never both reveal the same result. The main link
// (via=main) stays idle while the gacha's own link is in use (C4).
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  touchOverlaySeen(user);
  const now = new Date();
  const look = await prisma.user.findUnique({
    where: { id: user.id },
    select: { gachaColor: true, alertColor: true, wheelSeenAt: true, gachaSeenAt: true, mediaSeenAt: true, bossLinkSeenAt: true },
  });
  const color = look?.gachaColor ?? look?.alertColor ?? null;
  if (viaOf(req) === "main") {
    if (look && ownLinksOf(look, now).gacha) return NextResponse.json({ pull: null, color });
  } else {
    await touchSeen(user.id, "gachaSeenAt", look?.gachaSeenAt ?? null, now);
  }
  return NextResponse.json({ pull: await nextOverlayPull(user.id), color });
}
