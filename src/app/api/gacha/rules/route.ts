import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The gacha's own first-enable checklist was ticked (its odds aren't equal
 * like the wheel's, so the wheel's acceptance doesn't cover it): remember
 * when, once per creator, and turn the gacha card on.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await prisma.user.updateMany({
    where: { id: user.id, gachaRulesAcceptedAt: null },
    data: { gachaRulesAcceptedAt: new Date() },
  });
  await prisma.user.update({ where: { id: user.id }, data: { gachaEnabled: true } });
  return NextResponse.json({ ok: true });
}
