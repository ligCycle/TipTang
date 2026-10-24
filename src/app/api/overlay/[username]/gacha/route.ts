import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { nextOverlayPull } from "@/lib/gacha-server";

// Polled by the gacha OBS link. Each call hands out (and claims) at most one
// pull, so two open sources never both reveal the same result.
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  touchOverlaySeen(user);
  const look = await prisma.user.findUnique({ where: { id: user.id }, select: { gachaColor: true, alertColor: true } });
  return NextResponse.json({ pull: await nextOverlayPull(user.id), color: look?.gachaColor ?? look?.alertColor ?? null });
}
