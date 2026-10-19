import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanName, cleanPrice } from "@/lib/alert-sets";
import { getActiveSetId, touchSet } from "@/lib/alert-sets-server";
import { parseItems } from "../items";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Change one set. Body may carry any of: `name`, `activate: true`,
 * `items` (replace all), `item` (one row: add or update), `removeAssetId`.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const set = await prisma.alertSet.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!set) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });

  let itemsChanged = false;

  if (body.name !== undefined) {
    const name = cleanName(body.name);
    if (!name) return NextResponse.json({ error: "invalid" }, { status: 400 });
    await prisma.alertSet.update({ where: { id }, data: { name } });
  }

  if (body.items !== undefined) {
    const items = await parseItems(user.id, body.items);
    if (!items) return NextResponse.json({ error: "invalid" }, { status: 400 });
    await prisma.$transaction([
      prisma.alertSetItem.deleteMany({ where: { setId: id } }),
      prisma.alertSetItem.createMany({ data: items.map((i) => ({ ...i, setId: id })) }),
    ]);
    itemsChanged = true;
  }

  if (body.item !== undefined) {
    const o = body.item as Record<string, unknown> | null;
    const assetId = typeof o?.assetId === "string" ? o.assetId : null;
    const own = assetId
      ? await prisma.alertAsset.count({ where: { id: assetId, userId: user.id } })
      : 0;
    const minAmount = o?.minAmount === undefined ? undefined : cleanPrice(o.minAmount);
    if (!assetId || own === 0 || minAmount === null) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    const patch = {
      ...(typeof o?.fanPickable === "boolean" ? { fanPickable: o.fanPickable } : {}),
      ...(minAmount !== undefined ? { minAmount } : {}),
    };
    await prisma.alertSetItem.upsert({
      where: { setId_assetId: { setId: id, assetId } },
      create: { setId: id, assetId, ...patch },
      update: patch,
    });
    itemsChanged = true;
  }

  if (typeof body.removeAssetId === "string") {
    await prisma.alertSetItem.deleteMany({ where: { setId: id, assetId: body.removeAssetId } });
    itemsChanged = true;
  }

  if (body.activate === true) {
    await prisma.user.update({ where: { id: user.id }, data: { activeSetId: id } });
  }

  if (itemsChanged) await touchSet(id);
  revalidatePath("/overlay/[username]", "page");
  return NextResponse.json({ ok: true });
}

/** Delete a set — never the active one, never the last one. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const set = await prisma.alertSet.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!set) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if ((await getActiveSetId(user.id)) === id) {
    return NextResponse.json({ error: "active" }, { status: 409 });
  }
  if ((await prisma.alertSet.count({ where: { userId: user.id } })) <= 1) {
    return NextResponse.json({ error: "last" }, { status: 409 });
  }
  await prisma.alertSet.delete({ where: { id } });
  revalidatePath("/overlay/[username]", "page");
  return NextResponse.json({ ok: true });
}
