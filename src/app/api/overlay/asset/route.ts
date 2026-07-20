import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadImage,
  ALLOWED_ALERT_IMAGE_TYPES,
  ALLOWED_AUDIO_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_AUDIO_BYTES,
  MAX_VIDEO_BYTES,
} from "@/lib/storage";

const KINDS = {
  sound: { field: "alertSoundUrl", folder: "alert-sounds", types: ALLOWED_AUDIO_TYPES, max: MAX_AUDIO_BYTES },
  image: { field: "alertImageUrl", folder: "alert-images", types: ALLOWED_ALERT_IMAGE_TYPES, max: MAX_UPLOAD_BYTES },
  video: { field: "alertVideoUrl", folder: "alert-videos", types: ALLOWED_VIDEO_TYPES, max: MAX_VIDEO_BYTES },
} as const;

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

  // Alert card / goal-bar color (hex) — not a file upload.
  if (kind === "color" || kind === "goalColor") {
    const field = kind === "goalColor" ? "goalColor" : "alertColor";
    if (remove) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { [field]: null },
      });
      return NextResponse.json({ ok: true, color: null });
    }
    const color = String(form?.get("color") ?? "");
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: session.user.id },
      data: { [field]: color },
    });
    return NextResponse.json({ ok: true, color });
  }

  // Set the fundraising goal (title + amount) from the dashboard OBS card.
  if (kind === "goalSet") {
    const title = String(form?.get("title") ?? "").trim().slice(0, 80);
    const amountRaw = Number(form?.get("amount") ?? 0);
    const amount =
      Number.isFinite(amountRaw) && amountRaw > 0
        ? Math.min(amountRaw, 100000000)
        : null;
    await prisma.user.update({
      where: { id: session.user.id },
      data: { goalTitle: title || null, goalAmount: amount },
    });
    return NextResponse.json({
      ok: true,
      title: title || "",
      amount: amount ?? "",
      hasGoal: amount !== null,
    });
  }

  // Goal-bar overlay on/off toggle.
  if (kind === "goalToggle") {
    const enabled = form?.get("enabled") === "1";
    await prisma.user.update({
      where: { id: session.user.id },
      data: { goalOverlayEnabled: enabled },
    });
    return NextResponse.json({ ok: true, enabled });
  }

  // Read-aloud (TTS) on/off toggle.
  if (kind === "ttsToggle") {
    const enabled = form?.get("enabled") === "1";
    await prisma.user.update({
      where: { id: session.user.id },
      data: { ttsEnabled: enabled },
    });
    return NextResponse.json({ ok: true, enabled });
  }

  if (kind !== "sound" && kind !== "image" && kind !== "video") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const cfg = KINDS[kind];

  if (remove) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { [cfg.field]: null },
    });
    return NextResponse.json({ ok: true, url: null });
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > cfg.max) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  if (!cfg.types.includes(file.type)) {
    return NextResponse.json({ error: "bad_type" }, { status: 415 });
  }

  const url = await uploadImage(file, cfg.folder);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { [cfg.field]: url },
  });

  return NextResponse.json({ ok: true, url });
}
