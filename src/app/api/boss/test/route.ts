import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentIndex, liveDefs } from "@/lib/boss-server";
import { pushBossTest } from "@/lib/overlay-test";

/**
 * "ทดสอบบนจอ": a scripted fight on the boss link with the current boss (or a
 * sample one when the list is empty). Plays even with the card off; never
 * touches real data (C10).
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { bossDefId: true } });
  if (!u) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const defs = await liveDefs(prisma, user.id);
  const d = defs[await currentIndex(prisma, user.id, defs, u.bossDefId)];
  await pushBossTest(user.id, d ? { name: d.name, hp: d.hp, imageUrl: d.imageUrl } : { name: "บอสตัวอย่าง", hp: 500, imageUrl: null });
  return NextResponse.json({ ok: true });
}
