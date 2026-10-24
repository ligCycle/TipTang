import { NextResponse } from "next/server";
import { overlayUser, timerState } from "@/lib/overlay-feed";
import { touchOwnBar } from "@/lib/obs-stage-server";

// Polled by the subathon-timer link. Validates the secret key and returns
// the current remaining seconds (server-computed, so the client doesn't depend
// on its own clock being correct).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await touchOwnBar(req, user, "timerLinkSeenAt", new Date());
  const t = timerState(user);
  return NextResponse.json({
    enabled: t.enabled,
    state: t.state,
    running: t.state === "running",
    remainingSeconds: t.remainingSeconds,
    maxSeconds: t.maxSeconds,
    rates: t.rates,
  });
}
