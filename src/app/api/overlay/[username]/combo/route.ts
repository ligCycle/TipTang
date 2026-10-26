import { NextResponse } from "next/server";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { touchOwnBar } from "@/lib/obs-stage-server";
import { comboJson } from "@/lib/link-feed-server";

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
  await touchOwnBar(req, user, "comboLinkSeenAt", now);
  return NextResponse.json(await comboJson(user.id, now));
}
