import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The first-enable checklist was ticked: remember when (once per creator)
 * and turn the wheel card on.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await prisma.user.updateMany({
    where: { id: user.id, wheelRulesAcceptedAt: null },
    data: { wheelRulesAcceptedAt: new Date() },
  });
  await prisma.user.update({ where: { id: user.id }, data: { wheelEnabled: true } });
  return NextResponse.json({ ok: true });
}
