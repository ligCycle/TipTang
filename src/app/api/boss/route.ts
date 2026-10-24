import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanHex } from "@/lib/pk";
import { bossSettings, resetBoss } from "@/lib/boss-server";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await bossSettings(user.id);
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(s);
}

/** `{ color }` (hex or null) or `{ reset: true }` (a new run from boss 1). */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (body.reset === true) {
    await resetBoss(user.id, new Date());
  } else if (body.color !== undefined) {
    const color = body.color === null ? null : cleanHex(body.color);
    if (body.color !== null && !color) return NextResponse.json({ error: "invalid" }, { status: 400 });
    await prisma.user.update({ where: { id: user.id }, data: { bossColor: color } });
  } else {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  return NextResponse.json(await bossSettings(user.id));
}
