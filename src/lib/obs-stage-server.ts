import "server-only";
import { prisma } from "@/lib/prisma";
import { readBossTest, readGachaTest, readWheelTest } from "@/lib/overlay-test";
import { ownLinkLive, stageCards, type OwnLinks, type StageLink } from "@/lib/obs-stage";

/** Which page polled a feed: the main link, the bars link, or the feature's own link (null). */
export type Via = StageLink | null;
export function viaOf(req: Request): Via {
  const v = new URL(req.url).searchParams.get("via");
  return v === "main" || v === "bars" ? v : null;
}

type SeenField = "mainSeenAt" | "barsSeenAt" | "wheelSeenAt" | "gachaSeenAt" | "bossLinkSeenAt";

/** Remember a poll (at most every 30 s), like touchComboSeen. */
export async function touchSeen(userId: string, field: SeenField, seenAt: Date | null, now: Date): Promise<void> {
  if (seenAt && seenAt.getTime() >= now.getTime() - 30_000) return;
  const stale = new Date(now.getTime() - 30_000);
  await prisma.user.updateMany({
    where: { id: userId, OR: [{ [field]: null }, { [field]: { lt: stale } }] },
    data: { [field]: now },
  });
}

const OWN_SELECT = { wheelSeenAt: true, gachaSeenAt: true, mediaSeenAt: true, bossLinkSeenAt: true } as const;

/** Per-feature popup links still in use: the main link leaves those features to them (C4). */
export function ownLinksOf(
  u: { wheelSeenAt: Date | null; gachaSeenAt: Date | null; mediaSeenAt: Date | null; bossLinkSeenAt: Date | null },
  now: Date,
): OwnLinks {
  return {
    wheel: ownLinkLive(u.wheelSeenAt, now),
    gacha: ownLinkLive(u.gachaSeenAt, now),
    media: ownLinkLive(u.mediaSeenAt, now),
    boss: ownLinkLive(u.bossLinkSeenAt, now),
  };
}

/** Is this feature's own link live (so a main-link poll must stay idle)? */
export async function ownLinkLiveFor(userId: string, feature: keyof OwnLinks, now: Date): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: OWN_SELECT });
  return u ? ownLinksOf(u, now)[feature] : false;
}

/** The stage poll: which clients the main or bars link mounts; touches that link's seen time. */
export async function stageFor(userId: string, link: StageLink, now: Date) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...OWN_SELECT,
      mainSeenAt: true,
      barsSeenAt: true,
      alertsEnabled: true,
      mediaEnabled: true,
      voiceEnabled: true,
      wheelEnabled: true,
      gachaEnabled: true,
      bossEnabled: true,
      goalOverlayEnabled: true,
      timerEnabled: true,
      comboEnabled: true,
      pkEnabled: true,
    },
  });
  if (!u) return null;
  await touchSeen(userId, link === "main" ? "mainSeenAt" : "barsSeenAt", link === "main" ? u.mainSeenAt : u.barsSeenAt, now);
  const flags = {
    alerts: u.alertsEnabled,
    media: u.mediaEnabled,
    voice: u.voiceEnabled,
    wheel: u.wheelEnabled,
    gacha: u.gachaEnabled,
    boss: u.bossEnabled,
    goal: u.goalOverlayEnabled,
    timer: u.timerEnabled,
    combo: u.comboEnabled,
    pk: u.pkEnabled,
  };
  if (link === "bars") return stageCards(flags, ownLinksOf(u, now), NO_TESTS, "bars");
  const t = now.getTime();
  const [wheel, gacha, boss] = await Promise.all([readWheelTest(userId, t), readGachaTest(userId, t), readBossTest(userId, t)]);
  // A pending test mounts its client even with the card off (C10). Media tests
  // play only with the card on, so they need no flag here.
  const tests = { wheel: Boolean(wheel), gacha: Boolean(gacha), media: false, boss: Boolean(boss) };
  return stageCards(flags, ownLinksOf(u, now), tests, "main");
}

const NO_TESTS: OwnLinks = { wheel: false, gacha: false, media: false, boss: false };
