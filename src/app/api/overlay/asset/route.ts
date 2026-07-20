import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadImage,
  ALLOWED_ALERT_IMAGE_TYPES,
  ALLOWED_AUDIO_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_AUDIO_BYTES,
} from "@/lib/storage";

// Auth required: set/remove the creator's custom alert sound or image.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  const remove = form?.get("remove") === "1";
  const file = form?.get("file");

  if (kind !== "sound" && kind !== "image") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const field = kind === "sound" ? "alertSoundUrl" : "alertImageUrl";

  if (remove) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { [field]: null },
    });
    return NextResponse.json({ ok: true, url: null });
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const allowed = kind === "sound" ? ALLOWED_AUDIO_TYPES : ALLOWED_ALERT_IMAGE_TYPES;
  const maxBytes = kind === "sound" ? MAX_AUDIO_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: "bad_type" }, { status: 415 });
  }

  const url = await uploadImage(
    file,
    kind === "sound" ? "alert-sounds" : "alert-images",
  );
  await prisma.user.update({
    where: { id: session.user.id },
    data: { [field]: url },
  });

  return NextResponse.json({ ok: true, url });
}
