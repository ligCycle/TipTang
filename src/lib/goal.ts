import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Sum of confirmed tips that count toward the creator's CURRENT goal round.
 *
 * `goalStartedAt` is when the creator last pressed "start a new round"; only
 * tips confirmed at/after it count. Null means they never reset, so every
 * confirmed tip counts — exactly the behaviour before the field existed.
 *
 * Computed live from the tips every time (no stored running total), so a tip
 * that is rejected or deleted later simply stops counting. Nothing can drift.
 */
export async function goalRaised(
  creatorId: string,
  goalStartedAt: Date | null,
): Promise<number> {
  const agg = await prisma.tip.aggregate({
    where: {
      creatorId,
      status: "CONFIRMED",
      // Spread the date filter in only when a round has been started, so an
      // un-reset creator sends no filter at all rather than an empty one.
      ...(goalStartedAt ? { confirmedAt: { gte: goalStartedAt } } : {}),
    },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

/**
 * Percent of the goal reached. Deliberately NOT capped at 100 — a creator who
 * blew past the goal sees 150%, and it keeps climbing until they reset. The
 * bar's fill width is clamped separately where it is drawn.
 */
export function goalPercent(raised: number, goalAmount: number): number {
  return goalAmount > 0 ? Math.round((raised / goalAmount) * 100) : 0;
}
