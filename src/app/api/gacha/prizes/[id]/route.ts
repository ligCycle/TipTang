import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { lockCreator } from "@/lib/combo-server";
import { TIP_TX } from "@/lib/tip-hooks";
import { prisma } from "@/lib/prisma";
import { cleanPrizeText, isRarity, looksLikeMoney, MAX_PRIZES_PER_RARITY } from "@/lib/gacha";
import { gachaSettings } from "@/lib/gacha-server";
import { ownLibraryImage } from "@/lib/goal-images";

/** Edit a prize: any of `{ rarity, text, imageUrl, noAction }`. Bumps the box version. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const data: { rarity?: string; text?: string; imageUrl?: string | null; noAction?: boolean } = {};
  if (body.text !== undefined) {
    const text = cleanPrizeText(body.text);
    if (!text) return NextResponse.json({ error: "invalid" }, { status: 400 });
    if (looksLikeMoney(text)) return NextResponse.json({ error: "money_prize" }, { status: 400 });
    data.text = text;
  }
  if (body.rarity !== undefined) {
    if (!isRarity(body.rarity)) return NextResponse.json({ error: "invalid" }, { status: 400 });
    data.rarity = body.rarity;
  }
  if (body.imageUrl !== undefined) {
    const url = await ownLibraryImage(user.id, body.imageUrl);
    if (url === undefined) return NextResponse.json({ error: "invalid" }, { status: 400 });
    data.imageUrl = url;
  }
  if (body.noAction !== undefined) {
    if (typeof body.noAction !== "boolean") return NextResponse.json({ error: "invalid" }, { status: 400 });
    data.noAction = body.noAction;
  }
  const res = await prisma.$transaction(async (tx) => {
    await lockCreator(tx, user.id);
    const prize = await tx.gachaPrize.findFirst({ where: { id, userId: user.id, deletedAt: null }, select: { rarity: true } });
    if (!prize) return "not_found";
    if (data.rarity && data.rarity !== prize.rarity) {
      const n = await tx.gachaPrize.count({ where: { userId: user.id, deletedAt: null, rarity: data.rarity } });
      if (n >= MAX_PRIZES_PER_RARITY) return "too_many";
    }
    await tx.gachaPrize.update({ where: { id }, data });
    await tx.user.update({ where: { id: user.id }, data: { gachaVersion: { increment: 1 } } });
    return "ok";
  }, TIP_TX);
  if (res === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (res === "too_many") return NextResponse.json({ error: "too_many" }, { status: 409 });
  return NextResponse.json(await gachaSettings(user.id));
}

/** Remove a prize (kept for past pulls' history). Bumps the box version. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const ok = await prisma.$transaction(async (tx) => {
    await lockCreator(tx, user.id);
    const r = await tx.gachaPrize.updateMany({ where: { id, userId: user.id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (r.count > 0) await tx.user.update({ where: { id: user.id }, data: { gachaVersion: { increment: 1 } } });
    return r.count > 0;
  }, TIP_TX);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(await gachaSettings(user.id));
}
