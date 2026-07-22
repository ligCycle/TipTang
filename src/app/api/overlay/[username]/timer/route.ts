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
      timerRemaining: true,
      timerInitialSeconds: true,
      timerMaxSeconds: true,
    },
  });
  if (!user?.overlayKey || user.overlayKey !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Derived state: running (counting down) / paused (frozen) / stopped (shows
  // the starting time). The overlay shows a time in every state.
  let state: "running" | "paused" | "stopped";
  let remainingSeconds: number;
  if (user.timerEndsAt) {
    state = "running";
    remainingSeconds = Math.max(
      0,
      Math.round((user.timerEndsAt.getTime() - Date.now()) / 1000),
    );
  } else if (user.timerRemaining != null) {
    state = "paused";
    remainingSeconds = user.timerRemaining;
  } else {
    state = "stopped";
    remainingSeconds = user.timerInitialSeconds;
  }

  return NextResponse.json({
    enabled: user.timerEnabled,
    state,
    running: state === "running",
    remainingSeconds,
    maxSeconds: user.timerMaxSeconds ?? 0,
  });
}
