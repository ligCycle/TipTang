import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lockCreator } from "@/lib/combo-server";
import { TIP_TX } from "@/lib/tip-hooks";
import { cleanOdds } from "@/lib/gacha";
import { gachaSettings } from "@/lib/gacha-server";

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await gachaSettings(user.id);
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(s);
}

/**
 * Change any of `{ odds, price, color, enabled }`. Odds are three whole
 * numbers summing to 100; changing them bumps the box version (fans who saw
 * the old odds don't get a pull on them). Turning on needs the gacha rules
 * (409 `rules` — the page opens the checklist).
 */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const bad = () => NextResponse.json({ error: "invalid" }, { status: 400 });

  const data: {
    gachaCommon?: number;
    gachaRare?: number;
    gachaEpic?: number;
    gachaPrice?: number;
    gachaColor?: string | null;
    gachaEnabled?: boolean;
    gachaVersion?: { increment: number };
  } = {};
  if (body.odds !== undefined) {
    const odds = cleanOdds(body.odds);
    if (!odds) return bad();
    data.gachaCommon = odds.common;
    data.gachaRare = odds.rare;
    data.gachaEpic = odds.epic;
    data.gachaVersion = { increment: 1 };
  }
  if (body.price !== undefined) {
    const n = body.price;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 100_000) return bad();
    data.gachaPrice = n;
    data.gachaVersion = { increment: 1 };
  }
  if (body.color !== undefined) {
    if (body.color !== null && (typeof body.color !== "string" || !HEX.test(body.color))) return bad();
    data.gachaColor = body.color;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return bad();
    if (body.enabled) {
      const u = await prisma.user.findUnique({ where: { id: user.id }, select: { gachaRulesAcceptedAt: true } });
      if (!u?.gachaRulesAcceptedAt) return NextResponse.json({ error: "rules" }, { status: 409 });
    }
    data.gachaEnabled = body.enabled;
  }
  await prisma.$transaction(async (tx) => {
    await lockCreator(tx, user.id);
    await tx.user.update({ where: { id: user.id }, data });
  }, TIP_TX);
  return NextResponse.json(await gachaSettings(user.id));
}

