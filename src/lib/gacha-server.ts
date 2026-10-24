import "server-only";
import { randomInt } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  boxOdds,
  displayPercents,
  drawFromBox,
  effectiveOdds,
  isGachaBox,
  isRarity,
  RARITIES,
  type GachaBox,
  type Odds,
  type Rarity,
} from "@/lib/gacha";
import { LATE_PLAY_MS } from "@/lib/wheel";
import { readGachaTest, TEST_NAME } from "@/lib/overlay-test";

type Tx = Prisma.TransactionClient;

/**
 * "กาชา" server side (spec docs/superpowers/specs/2026-10-23-gacha-design.md,
 * rulings K1–K11). The box a fan saw is saved on their tip; the draw at
 * confirm uses only that snapshot, so the result always matches the odds and
 * prizes shown. Reject cancels the pull; confirming again restores it.
 */

const PRIZE_SELECT = { id: true, rarity: true, text: true, imageUrl: true, noAction: true, position: true } as const;

/** The creator's live prizes, in their order. */
export async function livePrizes(db: Tx | typeof prisma, userId: string) {
  const rows = await db.gachaPrize.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: PRIZE_SELECT,
  });
  return rows.filter((r) => isRarity(r.rarity)) as (Omit<(typeof rows)[number], "rarity"> & { rarity: Rarity })[];
}

function oddsOf(u: { gachaCommon: number; gachaRare: number; gachaEpic: number }): Odds {
  return { common: u.gachaCommon, rare: u.gachaRare, epic: u.gachaEpic };
}

export type GachaForFans = {
  version: number;
  price: number;
  /** Whole percentages per rarity (sum 100). */
  odds: Odds;
  tiers: { rarity: Rarity; prizes: string[] }[];
};

/** What the donate page shows: null when the card is off or nothing can come out (K9). */
export async function gachaForFans(userId: string): Promise<GachaForFans | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { gachaEnabled: true, gachaPrice: true, gachaCommon: true, gachaRare: true, gachaEpic: true, gachaVersion: true },
  });
  if (!u?.gachaEnabled) return null;
  const prizes = await livePrizes(prisma, userId);
  const box: GachaBox = { odds: oddsOf(u), prizes: prizes.map(toBoxPrize) };
  const odds = boxOdds(box);
  if (RARITIES.every((r) => odds[r] === 0)) return null;
  return {
    version: u.gachaVersion,
    price: u.gachaPrice,
    odds,
    tiers: RARITIES.map((rarity) => ({ rarity, prizes: prizes.filter((p) => p.rarity === rarity).map((p) => p.text) })),
  };
}

function toBoxPrize(p: { id: string; rarity: Rarity; text: string; imageUrl: string | null; noAction: boolean }) {
  return { id: p.id, rarity: p.rarity, text: p.text, imageUrl: p.imageUrl, noAction: p.noAction };
}

/**
 * The box to save on a new tip: only when the fan saw the current version
 * (K1) and something can come out. Null = the pull doesn't stand.
 */
export async function gachaSnapshot(userId: string, seenVersion: number): Promise<{ box: GachaBox; price: number } | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { gachaEnabled: true, gachaPrice: true, gachaCommon: true, gachaRare: true, gachaEpic: true, gachaVersion: true },
  });
  if (!u?.gachaEnabled || u.gachaVersion !== seenVersion) return null;
  const box: GachaBox = { odds: oddsOf(u), prizes: (await livePrizes(prisma, userId)).map(toBoxPrize) };
  const odds = boxOdds(box);
  if (RARITIES.every((r) => odds[r] === 0)) return null;
  return { box, price: u.gachaPrice };
}

export type GachaResult = "started" | "restored" | "none";

/**
 * The tip became CONFIRMED (inside the Tip-locked transaction): draw from the
 * tip's box, or bring back the pull a reject cancelled (same result, no
 * re-roll, `playedAt` kept so it doesn't replay).
 */
export async function gachaStartTx(tx: Tx, tipId: string, now: Date): Promise<GachaResult> {
  const tip = await tx.tip.findUnique({
    where: { id: tipId },
    select: { creatorId: true, gachaPull: true, gachaBox: true, gachaResult: { select: { id: true, status: true } } },
  });
  if (!tip?.gachaPull) return "none";
  if (tip.gachaResult) {
    if (tip.gachaResult.status === "ACTIVE") return "none";
    await tx.gachaPull.update({ where: { id: tip.gachaResult.id }, data: { status: "ACTIVE" } });
    return "restored";
  }
  if (!isGachaBox(tip.gachaBox)) return "none";
  const hit = drawFromBox(tip.gachaBox, (n) => randomInt(0, n));
  if (!hit) return "none";
  await tx.gachaPull.create({
    data: {
      userId: tip.creatorId,
      tipId,
      rarity: hit.rarity,
      prizeId: hit.prize.id,
      prizeText: hit.prize.text,
      imageUrl: hit.prize.imageUrl,
      noAction: hit.prize.noAction,
      confirmedAt: now,
    },
  });
  return "started";
}

/** A confirmed tip was rejected: its pull is cancelled (kept for a re-confirm). */
export async function cancelGachaTx(tx: Tx, tipId: string): Promise<void> {
  await tx.gachaPull.updateMany({ where: { tipId, status: "ACTIVE" }, data: { status: "CANCELLED" } });
}

/** The pull won't happen (dropped or forced past): it must never be drawn later (K2). */
export async function forgetGachaPull(db: Tx | typeof prisma, tipId: string): Promise<void> {
  await db.tip.updateMany({ where: { id: tipId, gachaResult: null }, data: { gachaPull: false } });
}

export type OverlayPull = {
  id: string;
  fan: string;
  rarity: Rarity;
  prizeText: string;
  imageUrl: string | null;
};

/**
 * The next pull to reveal on stream, claimed so it plays once across every
 * open gacha source: the oldest live pull not played yet, confirmed within
 * the late-play window. A pending dashboard test comes first (never claimed).
 */
export async function nextOverlayPull(userId: string, now: number = Date.now()): Promise<OverlayPull | null> {
  const test = await readGachaTest(userId, now);
  if (test) return { id: test.id, fan: TEST_NAME, rarity: test.rarity, prizeText: test.prizeText, imageUrl: test.imageUrl };
  for (let attempt = 0; attempt < 3; attempt++) {
    const pull = await prisma.gachaPull.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        playedAt: null,
        confirmedAt: { gte: new Date(now - LATE_PLAY_MS) },
        tip: { status: "CONFIRMED" },
      },
      orderBy: { confirmedAt: "asc" },
      select: { id: true, rarity: true, prizeText: true, imageUrl: true, tip: { select: { supporterName: true } } },
    });
    if (!pull) return null;
    const claimed = await prisma.gachaPull.updateMany({ where: { id: pull.id, playedAt: null }, data: { playedAt: new Date(now) } });
    if (claimed.count === 1) {
      return {
        id: pull.id,
        fan: pull.tip.supporterName,
        rarity: isRarity(pull.rarity) ? pull.rarity : "common",
        prizeText: pull.prizeText,
        imageUrl: pull.imageUrl,
      };
    }
  }
  return null;
}

/** To-do list rows for gacha prizes that need doing (K4). */
export async function gachaTodoRows(userId: string, status: "open" | "done", take: number, doneSince: Date) {
  return prisma.gachaPull.findMany({
    where: { userId, status: "ACTIVE", noAction: false, doneAt: status === "open" ? null : { gte: doneSince } },
    orderBy: status === "open" ? { confirmedAt: "asc" } : { doneAt: "desc" },
    take,
    select: {
      id: true,
      rarity: true,
      prizeText: true,
      confirmedAt: true,
      doneAt: true,
      tip: { select: { supporterName: true, amount: true } },
    },
  });
}

/** Settings page: current odds, effective odds and prizes. */
export async function gachaSettings(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      gachaEnabled: true,
      gachaPrice: true,
      gachaCommon: true,
      gachaRare: true,
      gachaEpic: true,
      gachaVersion: true,
      gachaColor: true,
      alertColor: true,
      gachaRulesAcceptedAt: true,
    },
  });
  if (!u) return null;
  const prizes = await livePrizes(prisma, userId);
  const counts = { common: 0, rare: 0, epic: 0 };
  for (const p of prizes) counts[p.rarity] += 1;
  return {
    enabled: u.gachaEnabled,
    price: u.gachaPrice,
    odds: oddsOf(u),
    effective: displayPercents(effectiveOdds(oddsOf(u), counts)),
    version: u.gachaVersion,
    color: u.gachaColor,
    alertColor: u.alertColor,
    rulesAccepted: u.gachaRulesAcceptedAt !== null,
    prizes,
  };
}
