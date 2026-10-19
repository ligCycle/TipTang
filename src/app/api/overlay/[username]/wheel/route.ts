import { NextResponse } from "next/server";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { nextOverlaySpin } from "@/lib/wheel-server";

// Polled by the wheel OBS link. Each call hands out (and claims) at most one
// spin, so two open sources never both animate the same result.
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
  return NextResponse.json({ spin: await nextOverlaySpin(user.id) });
}
