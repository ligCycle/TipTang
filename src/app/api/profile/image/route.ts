import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadImage,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";

// Auth required: upload an avatar or cover image for the logged-in creator.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  const file = form?.get("file");

  if (kind !== "avatar" && kind !== "cover") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "bad_type" }, { status: 415 });
  }

  const url = await uploadImage(file, kind === "avatar" ? "avatars" : "covers");
  await prisma.user.update({
    where: { id: session.user.id },
    data: kind === "avatar" ? { avatarUrl: url } : { coverUrl: url },
  });

  return NextResponse.json({ ok: true, url });
}
