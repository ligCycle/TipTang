import { NextResponse, after as runAfter } from "next/server";
import { prisma } from "@/lib/prisma";
import { tipSeconds } from "@/lib/subathon-math";

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
    select: {
      id: true,
      overlayKey: true,
      overlayLastSeenAt: true,
      timerEnabled: true,
      timerBahtPerUnit: true,
      timerSecondsPerUnit: true,
      timerReduceBahtPerUnit: true,
      timerReduceSecondsPerUnit: true,
    },
  });
  if (!user?.overlayKey || user.overlayKey !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Activation tracking: note that this overlay is really being polled (OBS
  // or a browser tab), for the admin funnel. The value we just read decides
  // whether to touch the DB at all, so the usual poll costs no extra query;
  // the WHERE repeats the check so two OBS instances can't both write.
  const OVERLAY_SEEN_STALE_MS = 5 * 60_000;
  const staleBefore = new Date(Date.now() - OVERLAY_SEEN_STALE_MS);
  if (!user.overlayLastSeenAt || user.overlayLastSeenAt < staleBefore) {
    const userId = user.id;
    runAfter(async () => {
      try {
        await prisma.user.updateMany({
          where: {
            id: userId,
            OR: [
              { overlayLastSeenAt: null },
              { overlayLastSeenAt: { lt: staleBefore } },
            ],
          },
          data: { overlayLastSeenAt: new Date() },
        });
      } catch (err) {
        console.error("[overlay] overlayLastSeenAt update failed:", err);
      }
    });
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
        timerEffect: true,
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

  const timerDeltaFor = (effect: "ADD" | "REDUCE" | "NONE", amount: number) => {
    if (!user.timerEnabled || effect === "NONE") return null;
    const sec =
      effect === "REDUCE"
        ? tipSeconds(amount, user.timerReduceBahtPerUnit, user.timerReduceSecondsPerUnit)
        : tipSeconds(amount, user.timerBahtPerUnit, user.timerSecondsPerUnit);
    return effect === "REDUCE" ? -sec : sec;
  };

  const merged = [
    ...tips.map((t) => ({
      id: `tip_${t.id}`,
      supporterName: t.supporterName,
      message: t.message,
      amount: Number(t.amount),
      confirmedAt: t.confirmedAt,
      // Seconds this tip moved the subathon clock (negative = sabotage), or
      // null when the timer is off / the supporter chose "just donate".
      timerDelta: timerDeltaFor(t.timerEffect, Number(t.amount)),
    })),
    ...orders.map((o) => ({
      id: `order_${o.id}`,
      supporterName: o.buyerName,
      message: `🛒 ${o.itemTitle}`,
      amount: Number(o.amount),
      confirmedAt: o.confirmedAt,
      timerDelta: null as number | null,
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
      timerDelta: m.timerDelta,
    })),
  });
}
