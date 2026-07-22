import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Polled by the OBS subathon-timer overlay. Validates the secret key and
// returns the current remaining seconds (server-computed, so the client
// doesn't depend on its own clock being correct).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const key = new URL(req.url).searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      overlayKey: true,
      timerEnabled: true,
      timerEndsAt: true,
    },
  });
  if (!user?.overlayKey || user.overlayKey !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const running = Boolean(user.timerEndsAt);
  const remainingSeconds = user.timerEndsAt
    ? Math.max(0, Math.round((user.timerEndsAt.getTime() - Date.now()) / 1000))
    : 0;

  return NextResponse.json({
    enabled: user.timerEnabled,
    running,
    remainingSeconds,
  });
}
