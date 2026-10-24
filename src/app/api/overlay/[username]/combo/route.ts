import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { comboFeed, touchComboSeen } from "@/lib/combo-server";
import { touchOwnBar } from "@/lib/obs-stage-server";

// Polled by the combo OBS link. Polling is also what makes tips count: combos
// only run while this link is open (src/lib/combo-server.ts).
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
  await touchOwnBar(req, user, "comboLinkSeenAt", new Date());
  const combo = await prisma.user.findUnique({
    where: { id: user.id },
    select: { comboEnabled: true, comboOverlaySeenAt: true },
  });
  await touchComboSeen(user.id, combo?.comboOverlaySeenAt ?? null, now);
  // Card off: nothing runs, but the dashboard's test still plays.
  if (!combo?.comboEnabled) return NextResponse.json(await comboFeed(user.id, now, { testOnly: true }));
  return NextResponse.json(await comboFeed(user.id, now));
}
