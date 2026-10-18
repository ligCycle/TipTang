import { NextResponse } from "next/server";
import { overlayUser, touchOverlaySeen, alertFeed, goalState, timerState } from "@/lib/overlay-feed";

// Polled by the single OBS link (/overlay/[username]/live): everything the
// stage shows in one request — alerts + test, goal, timer.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const url = new URL(req.url);
  const user = await overlayUser(username, url.searchParams.get("key"));
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  touchOverlaySeen(user);
  const [feed, goal] = await Promise.all([
    alertFeed(user, url.searchParams.get("after")),
    goalState(user),
  ]);
  return NextResponse.json({ ...feed, goal, timer: timerState(user) });
}
