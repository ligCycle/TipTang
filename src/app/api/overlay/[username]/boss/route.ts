import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { bossFeed, touchBossSeen } from "@/lib/boss-server";

// Polled by the boss OBS link. Polling is also what makes tips deal damage:
// the raid only runs while this link is open (src/lib/boss-server.ts).
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
    select: { bossEnabled: true, bossSeenAt: true },
  });
  // Seen before the on/off check, so the "connected" badge works before the card is on.
  await touchBossSeen(user.id, boss?.bossSeenAt ?? null, now);
  // Card off: nothing counts, but the dashboard's test still plays.
  const feed = await bossFeed(user.id, now, { testOnly: !boss?.bossEnabled });
  return NextResponse.json({ ...feed, serverNow: now.toISOString() });
}
