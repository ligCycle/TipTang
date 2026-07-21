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
  const gt =
    afterDate && !isNaN(afterDate.getTime()) ? { gt: afterDate } : undefined;

  // Union confirmed tips + confirmed shop orders → both pop on the stream.
  const [tips, orders] = await Promise.all([
    prisma.tip.findMany({
      where: { creatorId: user.id, status: "CONFIRMED", confirmedAt: gt },
      orderBy: { confirmedAt: "asc" },
      take: 10,
      select: {
        id: true,
        supporterName: true,
        message: true,
        amount: true,
        confirmedAt: true,
      },
    }),
    prisma.shopOrder.findMany({
      where: { creatorId: user.id, status: "CONFIRMED", confirmedAt: gt },
      orderBy: { confirmedAt: "asc" },
      take: 10,
      select: {
        id: true,
        buyerName: true,
        itemTitle: true,
        amount: true,
        confirmedAt: true,
      },
    }),
  ]);

  const merged = [
    ...tips.map((t) => ({
      id: `tip_${t.id}`,
      supporterName: t.supporterName,
      message: t.message,
      amount: Number(t.amount),
      confirmedAt: t.confirmedAt,
    })),
    ...orders.map((o) => ({
      id: `order_${o.id}`,
      supporterName: o.buyerName,
      message: `🛒 ${o.itemTitle}`,
      amount: Number(o.amount),
      confirmedAt: o.confirmedAt,
    })),
  ]
    .sort(
      (a, b) => (a.confirmedAt?.getTime() ?? 0) - (b.confirmedAt?.getTime() ?? 0),
    )
    .slice(0, 15);

  return NextResponse.json({
    tips: merged.map((m) => ({
      id: m.id,
      supporterName: m.supporterName,
      message: m.message,
      amount: m.amount,
      confirmedAt: m.confirmedAt?.toISOString() ?? null,
    })),
  });
}
