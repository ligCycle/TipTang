import "server-only";
import { prisma } from "@/lib/prisma";
import { timerState } from "@/lib/overlay-feed";
import { comboFeed, touchComboSeen } from "@/lib/combo-server";
import { bossFeed, touchBossSeen } from "@/lib/boss-server";
import { currentFor, testFeed } from "@/lib/pk-server";
import { goalFeed } from "@/lib/goal-server";
import { readPkTest } from "@/lib/overlay-test";
import { LATE_PLAY_MS } from "@/lib/wheel";
import { ownLinkLive, type BarCard, type MainCard, type OwnLinks, type StageLink } from "@/lib/obs-stage";
import { touchSeen } from "@/lib/obs-stage-server";

/*
 * One poll per OBS link (Vercel bills every request): the main and bars links
 * ask /stage only, and these build what each bar or popup used to fetch on
 * its own. The per-feature routes call the same functions, so a bar looks the
 * same on its own link and on the bars link.
 */

/** The timer bar's feed. */
export function timerJson(user: Parameters<typeof timerState>[0]) {
  const t = timerState(user);
  return {
    enabled: t.enabled,
    state: t.state,
    running: t.state === "running",
    remainingSeconds: t.remainingSeconds,
    maxSeconds: t.maxSeconds,
    rates: t.rates,
  };
}

/** The combo bar's feed; polling it is what keeps combos running. */
export async function comboJson(userId: string, now: Date) {
  const combo = await prisma.user.findUnique({
    where: { id: userId },
    select: { comboEnabled: true, comboOverlaySeenAt: true },
  });
  await touchComboSeen(userId, combo?.comboOverlaySeenAt ?? null, now);
  // Card off: nothing runs, but the dashboard's test still plays.
  return comboFeed(userId, now, { testOnly: !combo?.comboEnabled });
}

/** The PK bar's feed: the match now (a dashboard test first). */
export async function pkJson(userId: string, now: Date) {
  const test = await readPkTest(userId, now.getTime());
  return { match: test ? testFeed(test, now) : await currentFor(userId, now) };
}

/**
 * The boss feed. via=main: claim kills only when asked; bars: only while the
 * main link isn't live (S5); own link: always (and it marks that link open).
 */
export async function bossJson(userId: string, via: StageLink | null, claimParam: string | null, now: Date) {
  const boss = await prisma.user.findUnique({
    where: { id: userId },
    select: { bossEnabled: true, bossSeenAt: true, bossLinkSeenAt: true, mainSeenAt: true },
  });
  // Seen before the on/off check, so the "connected" badge works before the card is on.
  await touchBossSeen(userId, boss?.bossSeenAt ?? null, now);
  if (via === null) await touchSeen(userId, "bossLinkSeenAt", boss?.bossLinkSeenAt ?? null, now);
  // The boss's own link is in use: it plays the kills, the main link stays idle (C4).
  if (via === "main" && ownLinkLive(boss?.bossLinkSeenAt ?? null, now)) {
    return { phase: "off" as const, serverNow: now.toISOString() };
  }
  const claim = claimParam === "0" ? false : claimParam === "auto" ? !ownLinkLive(boss?.mainSeenAt ?? null, now) : true;
  const feed = await bossFeed(userId, now, { testOnly: !boss?.bossEnabled, claim });
  return { ...feed, serverNow: now.toISOString() };
}

/** Every bar the bars link shows, in one answer. */
export async function barsFeed(
  user: Parameters<typeof timerState>[0] & { id: string },
  cards: Record<BarCard, boolean>,
  now: Date,
) {
  const [goal, combo, pk, boss] = await Promise.all([
    cards.goal ? goalFeed(user.id) : null,
    cards.combo ? comboJson(user.id, now) : null,
    cards.pk ? pkJson(user.id, now) : null,
    cards.boss ? bossJson(user.id, "bars", "auto", now) : null,
  ]);
  return { goal, timer: cards.timer ? timerJson(user) : null, combo, pk, boss };
}

/**
 * Main link: which popup clients have something waiting, so they ask for it
 * now instead of polling all the time. A miss only delays: each client still
 * asks on its own every IDLE_POLL_MS.
 */
export async function mainHot(
  userId: string,
  cards: Record<MainCard, boolean>,
  tests: OwnLinks,
  now: Date,
): Promise<Record<Exclude<MainCard, "alerts">, boolean>> {
  const late = new Date(now.getTime() - LATE_PLAY_MS);
  const exists = (p: Promise<{ id: string } | null>) => p.then(Boolean);
  const [wheel, gacha, boss, media] = await Promise.all([
    !cards.wheel
      ? false
      : tests.wheel ||
        exists(
          prisma.spin.findFirst({
            where: { userId, status: "ACTIVE", playedAt: null, confirmedAt: { gte: late }, tip: { status: "CONFIRMED" } },
            select: { id: true },
          }),
        ),
    !cards.gacha
      ? false
      : tests.gacha ||
        exists(
          prisma.gachaPull.findFirst({
            where: { userId, status: "ACTIVE", playedAt: null, confirmedAt: { gte: late }, tip: { status: "CONFIRMED" } },
            select: { id: true },
          }),
        ),
    !cards.boss
      ? false
      : tests.boss || exists(prisma.bossKill.findFirst({ where: { userId, playedAt: null }, select: { id: true } })),
    !cards.media
      ? false
      : exists(
          prisma.mediaRequest.findFirst({ where: { userId, status: { in: ["PLAYING", "APPROVED"] } }, select: { id: true } }),
        ),
  ]);
  return { wheel, gacha, boss, media };
}
