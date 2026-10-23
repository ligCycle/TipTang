import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteItem, goalSettings, GoalError, updateItem } from "@/lib/goal-server";
import { ownLibraryImage } from "@/lib/goal-images";
import { cleanItemName, cleanItemPrice } from "@/lib/wishlist";

type Ctx = { params: Promise<{ id: string }> };

function failure(e: unknown) {
  if (e instanceof GoalError) {
    const status = e.code === "not_found" ? 404 : e.code === "invalid" ? 400 : 409;
    return NextResponse.json({ error: e.code }, { status });
  }
  throw e;
}

/** Change `{ name?, price?, imageUrl? }`. A lower price spills what it frees onward. */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const data: { name?: string; price?: number; imageUrl?: string | null } = {};
  if (body.name !== undefined) {
    const name = cleanItemName(body.name);
    if (!name) return NextResponse.json({ error: "invalid" }, { status: 400 });
    data.name = name;
  }
  if (body.price !== undefined) {
    const price = cleanItemPrice(body.price);
    if (price === null) return NextResponse.json({ error: "invalid" }, { status: 400 });
    data.price = price;
  }
  if (body.imageUrl !== undefined) {
    const img = await ownLibraryImage(user.id, body.imageUrl);
    if (img === undefined) return NextResponse.json({ error: "invalid" }, { status: 400 });
    data.imageUrl = img;
  }
  try {
    await updateItem(user.id, id, data);
  } catch (e) {
    return failure(e);
  }
  return NextResponse.json(await goalSettings(user.id));
}

/** Delete an item (never the last one). An unfilled item's baht moves to the others. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await deleteItem(user.id, id);
  } catch (e) {
    return failure(e);
  }
  return NextResponse.json(await goalSettings(user.id));
}
