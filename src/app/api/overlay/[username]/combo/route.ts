import { NextResponse } from "next/server";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { comboFeed, touchComboSeen } from "@/lib/combo-server";

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
  await touchComboSeen(user.id, now);
  return NextResponse.json(await comboFeed(user.id, now));
}
