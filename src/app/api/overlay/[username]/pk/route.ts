import { NextResponse } from "next/server";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { touchOwnBar } from "@/lib/obs-stage-server";
import { currentFor, testFeed } from "@/lib/pk-server";
import { readPkTest } from "@/lib/overlay-test";

// Polled by the PK OBS link: the match now (a dashboard test first).
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  touchOverlaySeen(user);
  await touchOwnBar(req, user, "pkLinkSeenAt", new Date());
  const now = new Date();
  const test = await readPkTest(user.id, now.getTime());
  return NextResponse.json({ match: test ? testFeed(test, now) : await currentFor(user.id, now) });
}
