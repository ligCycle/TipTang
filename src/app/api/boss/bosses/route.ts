import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { lockCreator } from "@/lib/combo-server";
import { TIP_TX } from "@/lib/tip-hooks";
import { prisma } from "@/lib/prisma";
import { cleanBossHp, cleanBossName, cleanBossReward, MAX_BOSSES } from "@/lib/boss";
import { looksLikeMoney } from "@/lib/gacha";
import { bossSettings } from "@/lib/boss-server";
import { ownLibraryImage } from "@/lib/goal-images";

/**
 * Add a boss at the end: `{ name, hp, reward?, imageUrl? }`. The reward can't
 * be money or worth money (`money_prize`, same rule as the gacha); the picture
 * must be the creator's own library image.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = cleanBossName(body?.name);
  const hp = cleanBossHp(body?.hp);
  const reward = cleanBossReward(body?.reward);
  if (!body || !name || !hp || reward === null) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (reward && looksLikeMoney(reward)) return NextResponse.json({ error: "money_prize" }, { status: 400 });
  const imageUrl = body.imageUrl === undefined ? null : await ownLibraryImage(user.id, body.imageUrl);
  if (imageUrl === undefined) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const res = await prisma.$transaction(async (tx) => {
    await lockCreator(tx, user.id);
    const live = await tx.bossDef.findMany({ where: { userId: user.id, deletedAt: null }, select: { position: true } });
    if (live.length >= MAX_BOSSES) return "too_many";
    await tx.bossDef.create({
      data: { userId: user.id, name, hp, reward, imageUrl, position: live.reduce((m, d) => Math.max(m, d.position), 0) + 1 },
    });
    return "ok";
  }, TIP_TX);
  if (res === "too_many") return NextResponse.json({ error: "too_many" }, { status: 409 });
  return NextResponse.json(await bossSettings(user.id));
}

/** Reorder: `{ order: [bossId, …] }`, every live boss exactly once. The current boss stays current. */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { order?: unknown } | null;
  const order = body?.order;
  if (!Array.isArray(order) || !order.every((id) => typeof id === "string") || order.length > MAX_BOSSES) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const ok = await prisma.$transaction(async (tx) => {
    await lockCreator(tx, user.id);
    // Positions decide "the next boss", so a partial or repeated list would leave ties.
    const live = await tx.bossDef.findMany({ where: { userId: user.id, deletedAt: null }, select: { id: true } });
    const ids = order as string[];
    if (new Set(ids).size !== ids.length || ids.length !== live.length || !live.every((d) => ids.includes(d.id))) return false;
    for (const [i, id] of ids.entries()) {
      await tx.bossDef.update({ where: { id }, data: { position: i + 1 } });
    }
    return true;
  }, TIP_TX);
  if (!ok) return NextResponse.json({ error: "invalid" }, { status: 400 });
  return NextResponse.json(await bossSettings(user.id));
}
