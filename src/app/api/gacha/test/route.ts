import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { drawFromBox, type GachaBox } from "@/lib/gacha";
import { livePrizes } from "@/lib/gacha-server";
import { pushGachaTest } from "@/lib/overlay-test";

/**
 * "ทดสอบบนจอ": a sample pull on the gacha link, drawn from the current box
 * (or a stand-in prize when the box is still empty). Never touches real data.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { gachaCommon: true, gachaRare: true, gachaEpic: true },
  });
  if (!u) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const prizes = await livePrizes(prisma, user.id);
  const box: GachaBox = {
    odds: { common: u.gachaCommon, rare: u.gachaRare, epic: u.gachaEpic },
    prizes: prizes.map((p) => ({ id: p.id, rarity: p.rarity, text: p.text, imageUrl: p.imageUrl, noAction: p.noAction })),
  };
  const hit = drawFromBox(box, (n) => randomInt(0, n));
  await pushGachaTest(
    user.id,
    hit
      ? { rarity: hit.rarity, prizeText: hit.prize.text, imageUrl: hit.prize.imageUrl }
      : { rarity: "epic", prizeText: "รางวัลตัวอย่าง", imageUrl: null },
  );
  return NextResponse.json({ ok: true });
}
