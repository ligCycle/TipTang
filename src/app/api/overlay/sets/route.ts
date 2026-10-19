import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanName, MAX_SETS } from "@/lib/alert-sets";
import { getActiveSetId } from "@/lib/alert-sets-server";
import { parseItems } from "./items";

/** The creator's sound sets and which one is active. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const activeSetId = await getActiveSetId(user.id);
  const sets = await prisma.alertSet.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      items: { select: { assetId: true, fanPickable: true, minAmount: true } },
    },
  });
  return NextResponse.json({ activeSetId, sets });
}

/**
 * Create a set: `{ name, items?, copyFromId?, activate? }`. Without items,
 * `copyFromId` copies another set's files, switches and prices.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const name = cleanName(body?.name);
  if (!name) return NextResponse.json({ error: "invalid" }, { status: 400 });

  if ((await prisma.alertSet.count({ where: { userId: user.id } })) >= MAX_SETS) {
    return NextResponse.json({ error: "too_many" }, { status: 409 });
  }

  let items = await parseItems(user.id, body?.items ?? []);
  if (!items) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (items.length === 0 && typeof body?.copyFromId === "string") {
    const source = await prisma.alertSet.findFirst({
      where: { id: body.copyFromId, userId: user.id },
      select: { items: { select: { assetId: true, fanPickable: true, minAmount: true } } },
    });
    if (!source) return NextResponse.json({ error: "invalid" }, { status: 400 });
    items = source.items;
  }

  const set = await prisma.alertSet.create({
    data: { userId: user.id, name, items: { create: items } },
    select: { id: true },
  });
  if (body?.activate === true) {
    await prisma.user.update({ where: { id: user.id }, data: { activeSetId: set.id } });
  }
  revalidatePath("/overlay/[username]", "page");
  return NextResponse.json({ id: set.id });
}
