import { NextResponse } from "next/server";
import { alertFeed, overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { stageFor } from "@/lib/obs-stage-server";
import { barsFeed, mainHot } from "@/lib/link-feed-server";

// The one poll of the main link and of the bars link (each request costs on
// Vercel, so a link asks once per tick, not once per feature). Main: which
// popup clients to mount, which of them have something waiting (hot), and
// the alerts after `after` when the alerts client sent its cursor. Bars:
// which bars to mount and each one's feed. Also what marks those links
// "connected" on the dashboard.
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const sp = new URL(req.url).searchParams;
  const user = await overlayUser(username, sp.get("key"));
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  touchOverlaySeen(user);
  const now = new Date();
  if (sp.get("link") === "bars") {
    const stage = await stageFor(user.id, "bars", now);
    if (!stage) return NextResponse.json({ cards: null });
    return NextResponse.json({ cards: stage.cards, feeds: await barsFeed(user, stage.cards, now) });
  }
  const stage = await stageFor(user.id, "main", now);
  if (!stage) return NextResponse.json({ cards: null });
  const [hot, alerts] = await Promise.all([
    mainHot(user.id, stage.cards, stage.tests, now),
    sp.has("after") ? alertFeed(user, sp.get("after"), sp.get("v")) : null,
  ]);
  return NextResponse.json({ cards: stage.cards, hot, alerts });
}
