import { NextResponse } from "next/server";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { viaOf } from "@/lib/obs-stage-server";
import { bossJson } from "@/lib/link-feed-server";

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
  touchOverlaySeen(user);
  return NextResponse.json(await bossJson(user.id, viaOf(req), new URL(req.url).searchParams.get("claim"), new Date()));
}
