import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { goalRaised, goalPercent } from "@/lib/goal";

// Polled by the OBS goal-bar overlay. Validates the secret key and returns the
// creator's current fundraising goal + amount raised (confirmed tips).
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
      id: true,
      overlayKey: true,
      goalTitle: true,
      goalAmount: true,
      goalStartedAt: true,
      goalOverlayEnabled: true,
    },
  });
  if (!user?.overlayKey || user.overlayKey !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const goal = user.goalAmount ? Number(user.goalAmount) : 0;
  const raised = await goalRaised(user.id, user.goalStartedAt);
  const pct = goalPercent(raised, goal);

  return NextResponse.json({
    enabled: user.goalOverlayEnabled,
    title: user.goalTitle ?? "",
    goal,
    raised,
    pct,
  });
}
