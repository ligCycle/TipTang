import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { lockCreator } from "@/lib/combo-server";
import { TIP_TX } from "@/lib/tip-hooks";
import { prisma } from "@/lib/prisma";
import { cleanPrizeText, isRarity, looksLikeMoney, MAX_PRIZES, MAX_PRIZES_PER_RARITY } from "@/lib/gacha";
import { gachaSettings } from "@/lib/gacha-server";
import { ownLibraryImage } from "@/lib/goal-images";

/**
 * Add a prize: `{ rarity, text, imageUrl?, noAction? }`. Text can't be money
 * or worth money (`money_prize`); the picture must be the creator's own
 * library image. Every change bumps the box version.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = cleanPrizeText(body?.text);
  if (!body || !isRarity(body.rarity) || !text) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (looksLikeMoney(text)) return NextResponse.json({ error: "money_prize" }, { status: 400 });
  const imageUrl = body.imageUrl === undefined ? null : await ownLibraryImage(user.id, body.imageUrl);
  if (imageUrl === undefined) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const rarity = body.rarity;
  const res = await prisma.$transaction(async (tx) => {
    await lockCreator(tx, user.id);
    const live = await tx.gachaPrize.findMany({ where: { userId: user.id, deletedAt: null }, select: { rarity: true, position: true } });
    if (live.length >= MAX_PRIZES || live.filter((p) => p.rarity === rarity).length >= MAX_PRIZES_PER_RARITY) return "too_many";
    await tx.gachaPrize.create({
      data: {
        userId: user.id,
        rarity,
        text,
        imageUrl,
        noAction: body.noAction === true,
        position: live.reduce((m, p) => Math.max(m, p.position), 0) + 1,
      },
    });
    await tx.user.update({ where: { id: user.id }, data: { gachaVersion: { increment: 1 } } });
    return "ok";
  }, TIP_TX);
  if (res === "too_many") return NextResponse.json({ error: "too_many" }, { status: 409 });
  return NextResponse.json(await gachaSettings(user.id));
}

/** Reorder: `{ order: [prizeId, …] }` (live prizes of this creator). */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { order?: unknown } | null;
  const order = body?.order;
  if (!Array.isArray(order) || !order.every((id) => typeof id === "string") || order.length > 50) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, user.id);
    for (const [i, id] of (order as string[]).entries()) {
      await tx.gachaPrize.updateMany({ where: { id, userId: user.id, deletedAt: null }, data: { position: i + 1 } });
    }
  }, TIP_TX);
  return NextResponse.json(await gachaSettings(user.id));
}
