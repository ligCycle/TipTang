import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { bossFeed, touchBossSeen } from "@/lib/boss-server";
import { ownLinkLive } from "@/lib/obs-stage";
import { touchSeen, viaOf } from "@/lib/obs-stage-server";

// Polled by the boss OBS link. Polling is also what makes tips deal damage:
// the raid only runs while this link is open (src/lib/boss-server.ts). The main
// and bars links send via=...; claim = 1 (default) claims kills, 0 never,
// auto only while the main link is not live (bars, S5).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const now = new Date();
  touchOverlaySeen(user);
  const boss = await prisma.user.findUnique({
    where: { id: user.id },
    select: { bossEnabled: true, bossSeenAt: true, bossLinkSeenAt: true, mainSeenAt: true },
  });
  // Seen before the on/off check, so the "connected" badge works before the card is on.
  await touchBossSeen(user.id, boss?.bossSeenAt ?? null, now);
  const via = viaOf(req);
  if (via === null) await touchSeen(user.id, "bossLinkSeenAt", boss?.bossLinkSeenAt ?? null, now);
  // The boss's own link is in use: it plays the kills, the main link stays idle (C4).
  if (via === "main" && ownLinkLive(boss?.bossLinkSeenAt ?? null, now)) {
    return NextResponse.json({ phase: "off", serverNow: now.toISOString() });
  }
  const c = new URL(req.url).searchParams.get("claim");
  const claim = c === "0" ? false : c === "auto" ? !ownLinkLive(boss?.mainSeenAt ?? null, now) : true;
  // Card off: nothing counts, but the dashboard's test still plays.
  const feed = await bossFeed(user.id, now, { testOnly: !boss?.bossEnabled, claim });
  return NextResponse.json({ ...feed, serverNow: now.toISOString() });
}
