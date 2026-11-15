import { NextResponse } from "next/server";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { touchOwnBar } from "@/lib/obs-stage-server";
import { topJson } from "@/lib/link-feed-server";

// Polled by the top supporters bar's own OBS link (the bars link gets the
// same feed through its one /stage poll).
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
  await touchOwnBar(req, user, "topLinkSeenAt", now);
  return NextResponse.json(await topJson(user, now));
}
