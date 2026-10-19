import "server-only";
import { after as runAfter } from "next/server";
import { prisma } from "@/lib/prisma";
import { tipSeconds } from "@/lib/subathon-math";
import { goalRaised, goalPercent } from "@/lib/goal";
import { readTestAlert, type TestAlert } from "@/lib/overlay-test";
import { nextCursor } from "@/lib/overlay-cursor";
import type { FeedTip } from "@/components/OverlayClient";
import type { GoalState } from "@/components/overlay/GoalView";
import type { TimerState } from "@/components/overlay/TimerView";

/**
 * What the OBS overlays poll: the per-feature endpoints (alerts / goal /
 * timer) share these, one link per feature.
 */

export const OVERLAY_USER_SELECT = {
  id: true,
  overlayKey: true,
  overlayLastSeenAt: true,
  alertsEnabled: true,
  timerEnabled: true,
  timerBahtPerUnit: true,
  timerSecondsPerUnit: true,
  timerReduceBahtPerUnit: true,
  timerReduceSecondsPerUnit: true,
  timerEndsAt: true,
  timerRemaining: true,
  timerInitialSeconds: true,
  timerMaxSeconds: true,
  goalTitle: true,
  goalAmount: true,
  goalStartedAt: true,
  goalOverlayEnabled: true,
} as const;

type OverlayUser = {
  id: string;
  overlayKey: string | null;
  overlayLastSeenAt: Date | null;
  alertsEnabled: boolean;
  timerEnabled: boolean;
  timerBahtPerUnit: number;
  timerSecondsPerUnit: number;
  timerReduceBahtPerUnit: number;
  timerReduceSecondsPerUnit: number;
  timerEndsAt: Date | null;
  timerRemaining: number | null;
  timerInitialSeconds: number;
  timerMaxSeconds: number | null;
  goalTitle: string | null;
  goalAmount: unknown;
  goalStartedAt: Date | null;
  goalOverlayEnabled: boolean;
};

/** The creator for `username` when `key` is their overlay key, else null. */
export async function overlayUser(username: string, key: string | null): Promise<OverlayUser | null> {
  if (!key) return null;
  const user = await prisma.user.findUnique({
    where: { username },
    select: OVERLAY_USER_SELECT,
  });
  if (!user?.overlayKey || user.overlayKey !== key) return null;
  return user;
}

/**
 * Activation tracking: note that this overlay is really being polled (OBS or
 * a browser tab), for the admin funnel and the dashboard's "connected" badge.
 * The value already read decides whether to touch the DB at all, so the usual
 * poll costs no extra query; the WHERE repeats the check so two OBS instances
 * can't both write.
 */
export function touchOverlaySeen(user: { id: string; overlayLastSeenAt: Date | null }): void {
  const OVERLAY_SEEN_STALE_MS = 5 * 60_000;
  const staleBefore = new Date(Date.now() - OVERLAY_SEEN_STALE_MS);
  if (user.overlayLastSeenAt && user.overlayLastSeenAt >= staleBefore) return;
  const userId = user.id;
  runAfter(async () => {
    try {
      await prisma.user.updateMany({
        where: {
          id: userId,
          OR: [{ overlayLastSeenAt: null }, { overlayLastSeenAt: { lt: staleBefore } }],
        },
        data: { overlayLastSeenAt: new Date() },
      });
    } catch (err) {
      console.error("[overlay] overlayLastSeenAt update failed:", err);
    }
  });
}

/**
 * Confirmed tips + shop orders after `after`, plus a pending dashboard test.
 * With alerts switched off: no tips, no test, and the cursor jumps to now so
 * nothing from the off period replays later.
 */
export async function alertFeed(
  user: OverlayUser,
  after: string | null,
): Promise<{ tips: FeedTip[]; test: TestAlert | null; cursor: string }> {
  const serverNow = new Date().toISOString();
  const off = !user.alertsEnabled;
  const afterDate = after ? new Date(after) : null;
  const validAfter = afterDate && !isNaN(afterDate.getTime()) ? afterDate : null;
  const gt = validAfter ? { gt: validAfter } : undefined;

  // Union confirmed tips + confirmed shop orders → both pop on the stream.
  const [tips, orders, test] = await Promise.all([
    off
      ? []
      : prisma.tip.findMany({
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
    off
      ? []
      : prisma.shopOrder.findMany({
          where: { creatorId: user.id, status: "CONFIRMED", confirmedAt: gt },
          orderBy: { confirmedAt: "asc" },
          take: 10,
          select: { id: true, buyerName: true, itemTitle: true, amount: true, confirmedAt: true },
        }),
    off ? null : readTestAlert(user.id),
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
      message: `สั่งซื้อ: ${o.itemTitle}`,
      amount: Number(o.amount),
      confirmedAt: o.confirmedAt,
      timerDelta: null as number | null,
    })),
  ]
    .sort((a, b) => (a.confirmedAt?.getTime() ?? 0) - (b.confirmedAt?.getTime() ?? 0))
    .slice(0, 15);

  const feedTips: FeedTip[] = merged.map((m) => ({
    id: m.id,
    supporterName: m.supporterName,
    message: m.message,
    amount: m.amount,
    confirmedAt: m.confirmedAt?.toISOString() ?? null,
    timerDelta: m.timerDelta,
  }));
  const cursor = nextCursor(
    validAfter ? validAfter.toISOString() : "",
    feedTips.map((t) => t.confirmedAt),
    serverNow,
    !off,
  );
  return { tips: feedTips, test, cursor };
}

/** The creator's goal and how much confirmed tips have raised toward it. */
export async function goalState(user: OverlayUser): Promise<GoalState> {
  const goal = user.goalAmount ? Number(user.goalAmount) : 0;
  const raised = await goalRaised(user.id, user.goalStartedAt);
  return {
    enabled: user.goalOverlayEnabled,
    title: user.goalTitle ?? "",
    goal,
    raised,
    pct: goalPercent(raised, goal),
  };
}

/**
 * Derived timer state: running (counting down) / paused (frozen) / stopped
 * (shows the starting time). Remaining seconds are server-computed so the
 * overlay never depends on its own clock being correct.
 */
export function timerState(user: OverlayUser): TimerState {
  let state: TimerState["state"];
  let remainingSeconds: number;
  if (user.timerEndsAt) {
    state = "running";
    remainingSeconds = Math.max(0, Math.round((user.timerEndsAt.getTime() - Date.now()) / 1000));
  } else if (user.timerRemaining != null) {
    state = "paused";
    remainingSeconds = user.timerRemaining;
  } else {
    state = "stopped";
    remainingSeconds = user.timerInitialSeconds;
  }
  return {
    enabled: user.timerEnabled,
    state,
    remainingSeconds,
    maxSeconds: user.timerMaxSeconds ?? 0,
  };
}
