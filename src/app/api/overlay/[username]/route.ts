import { NextResponse } from "next/server";
import { overlayUser, touchOverlaySeen, alertFeed } from "@/lib/overlay-feed";

// Polled by the old alert overlay link. Validates the secret key, returns
// confirmed tips after the `after` timestamp (so only new tips trigger
// alerts), a pending dashboard test, and the next cursor.
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
  return NextResponse.json(await alertFeed(user, url.searchParams.get("after")));
}
