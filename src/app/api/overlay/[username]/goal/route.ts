import { NextResponse } from "next/server";
import { overlayUser, goalState } from "@/lib/overlay-feed";

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
  return NextResponse.json(await goalState(user));
}
