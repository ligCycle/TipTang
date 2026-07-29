import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { shopItemSchema } from "@/lib/validators";
import { uploadImage, ALLOWED_ALERT_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/storage";

// Auth required: create a shop item (multipart: fields + optional image).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid" }, { status: 400 });

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

  // Deliverable only applies to digital items; ignore it for commissions.
  const deliverableText =
    parsed.data.type === "DIGITAL" && parsed.data.deliverableText
      ? parsed.data.deliverableText
      : null;

  let imageUrl: string | null = null;
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    if (!ALLOWED_ALERT_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "bad_type" }, { status: 415 });
    }
    imageUrl = await uploadImage(file, "shop");
  }

  const item = await prisma.shopItem.create({
    data: {
      creatorId: session.user.id,
      type: parsed.data.type,
      title: parsed.data.title,
      description: parsed.data.description || null,
      price: parsed.data.price,
      deliverableText,
      imageUrl,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: item.id });
}
