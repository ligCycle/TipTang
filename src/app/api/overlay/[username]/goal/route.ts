import { NextResponse } from "next/server";
import { overlayUser } from "@/lib/overlay-feed";
import { goalFeed } from "@/lib/goal-server";

// Polled by the old goal-bar link. Validates the secret key and returns the
// creator's current fundraising goal + amount raised (confirmed tips).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const feed = await goalFeed(user.id);
  // Bars already open in OBS keep the old script until they reload: give them
  // the old top-level fields too (the new client ignores them).
  return NextResponse.json(feed ? { ...feed, ...feed.single } : feed);
}
