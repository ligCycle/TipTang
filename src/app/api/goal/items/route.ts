import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { goalSettings } from "@/lib/goal-server";
import { ownLibraryImage } from "@/lib/goal-images";
import { cleanItemName, cleanItemPrice, MAX_ITEMS } from "@/lib/wishlist";

/** Add an item `{ name, price, imageUrl? }` at the bottom (at most 10). */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = cleanItemName(body?.name);
  const price = cleanItemPrice(body?.price);
  const imageUrl = body?.imageUrl === undefined ? null : await ownLibraryImage(user.id, body.imageUrl);
  if (!name || price === null || imageUrl === undefined) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const live = await prisma.wishItem.findMany({ where: { userId: user.id, deletedAt: null }, select: { position: true } });
  if (live.length >= MAX_ITEMS) return NextResponse.json({ error: "too_many" }, { status: 409 });
  const position = live.reduce((m, i) => Math.max(m, i.position + 1), 0);
  await prisma.wishItem.create({ data: { userId: user.id, name, price, imageUrl, position } });
  return NextResponse.json(await goalSettings(user.id));
}

/** Reorder `{ order: string[] }` (every live item id, top to bottom). Moves no money. */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { order?: unknown } | null;
  const order = Array.isArray(body?.order) ? body.order.filter((x): x is string => typeof x === "string") : null;
  const live = await prisma.wishItem.findMany({ where: { userId: user.id, deletedAt: null }, select: { id: true } });
  const ids = new Set(live.map((i) => i.id));
  if (!order || order.length !== ids.size || new Set(order).size !== order.length || !order.every((id) => ids.has(id))) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await prisma.$transaction(order.map((id, position) => prisma.wishItem.update({ where: { id }, data: { position } })));
  return NextResponse.json(await goalSettings(user.id));
}
