import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  uploadImage,
  deleteFile,
  ALLOWED_ALERT_IMAGE_TYPES,
  ALLOWED_AUDIO_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_AUDIO_BYTES,
  MAX_VIDEO_BYTES,
  MAX_LIBRARY_AUDIO_BYTES,
  MAX_LIBRARY_IMAGE_BYTES,
  MAX_LIBRARY_ITEMS,
} from "@/lib/storage";

// Clear the (dynamic) OBS overlay page cache so a running/next OBS load gets
// the latest assets.
function revalidateOverlay() {
  revalidatePath("/overlay/[username]", "page");
}

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

  // Alert card / goal-bar / timer color (hex) — not a file upload.
  if (kind === "color" || kind === "goalColor" || kind === "timerColor") {
    const field =
      kind === "goalColor"
        ? "goalColor"
        : kind === "timerColor"
          ? "timerColor"
          : "alertColor";
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

  // Subathon timer on/off toggle.
  if (kind === "timerToggle") {
    const enabled = form?.get("enabled") === "1";
    await prisma.user.update({
      where: { id: session.user.id },
      data: { timerEnabled: enabled },
    });
    return NextResponse.json({ ok: true, enabled });
  }

  // Subathon timer rate/initial/max config.
  if (kind === "timerConfig") {
    const clampInt = (v: unknown, min: number, max: number, dflt: number) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
    };
    const bahtPerUnit = clampInt(form?.get("bahtPerUnit"), 1, 100000, 10);
    const secondsPerUnit = clampInt(form?.get("secondsPerUnit"), 1, 86400, 60);
    const initialSeconds = clampInt(form?.get("initialSeconds"), 0, 604800, 3600);
    const maxRaw = Math.round(Number(form?.get("maxSeconds")));
    const maxSeconds =
      Number.isFinite(maxRaw) && maxRaw > 0 ? Math.min(maxRaw, 604800) : null;
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        timerBahtPerUnit: bahtPerUnit,
        timerSecondsPerUnit: secondsPerUnit,
        timerInitialSeconds: initialSeconds,
        timerMaxSeconds: maxSeconds,
      },
    });
    return NextResponse.json({
      ok: true,
      bahtPerUnit,
      secondsPerUnit,
      initialSeconds,
      maxSeconds,
    });
  }

  // Subathon timer control: start/resume / pause / reset.
  if (kind === "timerControl") {
    const control = String(form?.get("control") ?? "");
    const u = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        timerEndsAt: true,
        timerRemaining: true,
        timerInitialSeconds: true,
      },
    });
    const initial = u?.timerInitialSeconds ?? 3600;
    const now = Date.now();

    if (control === "start") {
      // Start fresh (from stopped) or resume from a paused remaining.
      const base = u?.timerRemaining != null ? u.timerRemaining : initial;
      await prisma.user.update({
        where: { id: session.user.id },
        data: { timerEndsAt: new Date(now + base * 1000), timerRemaining: null },
      });
      return NextResponse.json({
        ok: true,
        state: "running",
        remainingSeconds: base,
      });
    }
    if (control === "pause") {
      const rem = u?.timerEndsAt
        ? Math.max(0, Math.round((u.timerEndsAt.getTime() - now) / 1000))
        : (u?.timerRemaining ?? initial);
      await prisma.user.update({
        where: { id: session.user.id },
        data: { timerEndsAt: null, timerRemaining: rem },
      });
      return NextResponse.json({
        ok: true,
        state: "paused",
        remainingSeconds: rem,
      });
    }
    if (control === "reset") {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { timerEndsAt: null, timerRemaining: null },
      });
      return NextResponse.json({
        ok: true,
        state: "stopped",
        remainingSeconds: initial,
      });
    }
    return NextResponse.json({ error: "invalid" }, { status: 400 });
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

  // Random-alert library (many sounds / stickers per creator).
  if (kind === "librarySound" || kind === "librarySticker") {
    const assetKind = kind === "librarySound" ? "SOUND" : "STICKER";

    if (remove) {
      const assetId = String(form?.get("assetId") ?? "");
      const asset = await prisma.alertAsset.findFirst({
        where: { id: assetId, userId: session.user.id },
      });
      if (asset) {
        await deleteFile(asset.url); // free the storage before dropping the row
        await prisma.alertAsset.delete({ where: { id: asset.id } });
        revalidateOverlay();
      }
      return NextResponse.json({ ok: true, id: assetId });
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "no_file" }, { status: 400 });
    }
    const isSound = assetKind === "SOUND";
    const types = isSound ? ALLOWED_AUDIO_TYPES : ALLOWED_ALERT_IMAGE_TYPES;
    const max = isSound ? MAX_LIBRARY_AUDIO_BYTES : MAX_LIBRARY_IMAGE_BYTES;
    if (file.size > max) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    if (!types.includes(file.type)) {
      return NextResponse.json({ error: "bad_type" }, { status: 415 });
    }
    const count = await prisma.alertAsset.count({
      where: { userId: session.user.id, kind: assetKind },
    });
    if (count >= MAX_LIBRARY_ITEMS) {
      return NextResponse.json({ error: "too_many" }, { status: 409 });
    }
    const url = await uploadImage(
      file,
      isSound ? "alert-lib-sounds" : "alert-lib-stickers",
    );
    const created = await prisma.alertAsset.create({
      data: { userId: session.user.id, kind: assetKind, url },
      select: { id: true, url: true },
    });
    revalidateOverlay();
    return NextResponse.json({ ok: true, ...created });
  }

  if (kind !== "sound" && kind !== "image" && kind !== "video") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const cfg = KINDS[kind];

  // Current value (so we can free the old file on remove/replace).
  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { [cfg.field]: true } as Record<string, true>,
  });
  const oldUrl = (current as Record<string, string | null> | null)?.[cfg.field];

  if (remove) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { [cfg.field]: null },
    });
    await deleteFile(oldUrl);
    revalidateOverlay();
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
  await deleteFile(oldUrl); // replaced → free the previous file
  revalidateOverlay();

  return NextResponse.json({ ok: true, url });
}
