import { NextResponse } from "next/server";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { stageFor } from "@/lib/obs-stage-server";

// Polled by the main link (every 5 s) and the bars link: which feature clients
// to mount. Also what marks those links "connected" on the dashboard.
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const sp = new URL(req.url).searchParams;
  const user = await overlayUser(username, sp.get("key"));
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const link = sp.get("link") === "bars" ? "bars" : "main";
  touchOverlaySeen(user);
  const cards = await stageFor(user.id, link, new Date());
  return NextResponse.json({ cards });
}
