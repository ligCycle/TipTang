import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { lockCreator } from "@/lib/combo-server";
import { TIP_TX } from "@/lib/tip-hooks";
import { prisma } from "@/lib/prisma";
import { bossHasMoney, cleanBossHp, cleanBossName, cleanBossReward } from "@/lib/boss";
import { bossSettings, deleteDef } from "@/lib/boss-server";
import { ownLibraryImage } from "@/lib/goal-images";

/**
 * Edit a boss: any of `{ name, hp, reward, imageUrl }`. Lowering the current
 * boss's HP below the damage already dealt defeats it on the next hit.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const data: { name?: string; hp?: number; reward?: string; imageUrl?: string | null } = {};
  if (body.name !== undefined) {
    const name = cleanBossName(body.name);
    if (!name) return NextResponse.json({ error: "invalid" }, { status: 400 });
    if (bossHasMoney({ name })) return NextResponse.json({ error: "money_prize" }, { status: 400 });
    data.name = name;
  }
  if (body.hp !== undefined) {
    const hp = cleanBossHp(body.hp);
    if (!hp) return NextResponse.json({ error: "invalid" }, { status: 400 });
    data.hp = hp;
  }
  if (body.reward !== undefined) {
    const reward = cleanBossReward(body.reward);
    if (reward === null) return NextResponse.json({ error: "invalid" }, { status: 400 });
    if (bossHasMoney({ reward })) return NextResponse.json({ error: "money_prize" }, { status: 400 });
    data.reward = reward;
  }
  if (body.imageUrl !== undefined) {
    const url = await ownLibraryImage(user.id, body.imageUrl);
    if (url === undefined) return NextResponse.json({ error: "invalid" }, { status: 400 });
    data.imageUrl = url;
  }
  const ok = await prisma.$transaction(async (tx) => {
    await lockCreator(tx, user.id);
    const r = await tx.bossDef.updateMany({ where: { id, userId: user.id, deletedAt: null }, data });
    return r.count > 0;
  }, TIP_TX);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(await bossSettings(user.id));
}

/** Remove a boss. If it was the current one, the next boss takes over with the damage kept. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await deleteDef(user.id, id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(await bossSettings(user.id));
}
