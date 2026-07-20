import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    select: { id: true, overlayKey: true, goalTitle: true, goalAmount: true },
  });
  if (!user?.overlayKey || user.overlayKey !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const agg = await prisma.tip.aggregate({
    where: { creatorId: user.id, status: "CONFIRMED" },
    _sum: { amount: true },
  });

  const goal = user.goalAmount ? Number(user.goalAmount) : 0;
  const raised = Number(agg._sum.amount ?? 0);
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return NextResponse.json({
    title: user.goalTitle ?? "",
    goal,
    raised,
    pct,
  });
}
