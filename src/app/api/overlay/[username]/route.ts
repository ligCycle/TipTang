import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Polled by the OBS overlay. Validates the secret key, returns confirmed tips
// confirmed after the `after` timestamp (so only new tips trigger alerts).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const after = url.searchParams.get("after");

  if (!key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, overlayKey: true },
  });
  if (!user?.overlayKey || user.overlayKey !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const afterDate = after ? new Date(after) : null;
  const tips = await prisma.tip.findMany({
    where: {
      creatorId: user.id,
      status: "CONFIRMED",
      confirmedAt: afterDate && !isNaN(afterDate.getTime()) ? { gt: afterDate } : undefined,
    },
    orderBy: { confirmedAt: "asc" },
    take: 10,
    select: {
      id: true,
      supporterName: true,
      message: true,
      amount: true,
      confirmedAt: true,
    },
  });

  return NextResponse.json({
    tips: tips.map((t) => ({
      id: t.id,
      supporterName: t.supporterName,
      message: t.message,
      amount: Number(t.amount),
      confirmedAt: t.confirmedAt?.toISOString() ?? null,
    })),
  });
}
