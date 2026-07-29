import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { shopItemSchema } from "@/lib/validators";
import {
  uploadImage,
  deleteFile,
  ALLOWED_ALERT_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";

// Auth required (owner): edit / toggle active / archive (soft delete) an item.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const item = await prisma.shopItem.findFirst({
    where: { id, creatorId: session.user.id },
    select: { id: true, imageUrl: true },
  });
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const intent = form.get("intent");

  // Soft delete — never hard-delete (ShopOrder history references the item).
  if (intent === "archive") {
    await prisma.shopItem.update({
      where: { id },
      data: { isArchived: true, active: false },
    });
    return NextResponse.json({ ok: true });
  }

  if (intent === "toggleActive") {
    await prisma.shopItem.update({
      where: { id },
      data: { active: form.get("active") === "1" },
    });
    return NextResponse.json({ ok: true });
  }

  // Full edit.
  const parsed = shopItemSchema.safeParse({
    type: form.get("type"),
    title: form.get("title") ?? "",
    description: form.get("description") ?? "",
    price: form.get("price"),
    deliverableText: form.get("deliverableText") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Deliverable only applies to digital items; clear it for commissions.
  const deliverableText =
    parsed.data.type === "DIGITAL" && parsed.data.deliverableText
      ? parsed.data.deliverableText
      : null;

  let newImageUrl: string | undefined;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    if (!ALLOWED_ALERT_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "bad_type" }, { status: 415 });
    }
    newImageUrl = await uploadImage(file, "shop");
  }

  await prisma.shopItem.update({
    where: { id },
    data: {
      type: parsed.data.type,
      title: parsed.data.title,
      description: parsed.data.description || null,
      price: parsed.data.price,
      deliverableText,
      ...(newImageUrl ? { imageUrl: newImageUrl } : {}),
    },
  });
  // Replaced image → free the old file (safe: not referenced by history).
  if (newImageUrl) await deleteFile(item.imageUrl);

  return NextResponse.json({ ok: true });
}
