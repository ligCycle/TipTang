import { NextResponse } from "next/server";
import { fileMatchesType } from "@/lib/filetype";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lockCreator, stopComboTx } from "@/lib/combo-server";
import { isAlertStyle } from "@/lib/alertStyles";
import { isAlertTheme } from "@/lib/alertThemes";
import { isPresetId, presetChanges } from "@/lib/feature-presets";
import { cleanName, MAX_NAME } from "@/lib/alert-sets";
import { getActiveSetId, touchSet } from "@/lib/alert-sets-server";
import { setMediaEnabled, setVoiceEnabled } from "@/lib/media-queue";
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

  // "Start a new round": the goal bar counts only tips confirmed from this
  // moment on. Nothing is deleted or edited — old tips stay in the list, the
  // leaderboard, and the totals; only where the goal bar starts counting moves.
  // No revalidatePath here on purpose: the profile page is dynamic and the
  // on-stream bar polls /api/overlay/[username]/goal every 5s.
  if (kind === "goalReset") {
    const startedAt = new Date();
    // Under the creator lock so a tip confirming right now lands wholly in one round.
    await prisma.$transaction(async (tx) => {
      await lockCreator(tx, session.user.id);
      await tx.user.update({ where: { id: session.user.id }, data: { goalStartedAt: startedAt } });
    });
    return NextResponse.json({ ok: true, goalStartedAt: startedAt.toISOString() });
  }

  // First visit to the hub: a preset only switches features ON (never off,
  // never other settings); either answer marks the chooser as seen.
  if (kind === "preset" || kind === "onboardSkip") {
    const data: Record<string, unknown> = { featuresOnboardedAt: new Date() };
    if (kind === "preset") {
      const preset = form?.get("preset");
      if (!isPresetId(preset)) {
        return NextResponse.json({ error: "invalid" }, { status: 400 });
      }
      const cur = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { alertsEnabled: true, goalOverlayEnabled: true, timerEnabled: true },
      });
      if (cur) Object.assign(data, presetChanges(cur, preset));
    }
    await prisma.user.update({ where: { id: session.user.id }, data });
    return NextResponse.json({ ok: true });
  }

  // Donation alerts on/off (feature hub). Off = the feeds return no tips.
  if (kind === "alertsToggle") {
    const enabled = form?.get("enabled") === "1";
    await prisma.user.update({
      where: { id: session.user.id },
      data: { alertsEnabled: enabled },
    });
    return NextResponse.json({ ok: true, enabled });
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

    // Sabotage settings ride along in the same save.
    const reduceEnabled = form?.get("reduceEnabled") === "true";
    const reduceBahtPerUnit = clampInt(form?.get("reduceBahtPerUnit"), 1, 100000, 20);
    const reduceSecondsPerUnit = clampInt(form?.get("reduceSecondsPerUnit"), 1, 86400, 60);
    const reduceMinAmount = clampInt(form?.get("reduceMinAmount"), 1, 100000, 20);
    const floorSeconds = clampInt(form?.get("floorSeconds"), 0, 604800, 300);
    const showRates = form?.get("showRates") !== "false";

    const data: {
      timerBahtPerUnit: number;
      timerSecondsPerUnit: number;
      timerInitialSeconds: number;
      timerMaxSeconds: number | null;
      timerReduceEnabled: boolean;
      timerReduceBahtPerUnit: number;
      timerReduceSecondsPerUnit: number;
      timerReduceMinAmount: number;
      timerFloorSeconds: number;
      timerShowRates: boolean;
      timerColor?: string | null;
    } = {
      timerBahtPerUnit: bahtPerUnit,
      timerSecondsPerUnit: secondsPerUnit,
      timerInitialSeconds: initialSeconds,
      timerMaxSeconds: maxSeconds,
      timerReduceEnabled: reduceEnabled,
      timerReduceBahtPerUnit: reduceBahtPerUnit,
      timerReduceSecondsPerUnit: reduceSecondsPerUnit,
      timerReduceMinAmount: reduceMinAmount,
      timerFloorSeconds: floorSeconds,
      timerShowRates: showRates,
    };
    // Clock color persisted together: "" clears it (use alert color), a valid
    // hex sets it, anything else leaves it unchanged.
    const colorRaw = form?.get("color");
    if (typeof colorRaw === "string") {
      if (colorRaw === "") data.timerColor = null;
      else if (/^#[0-9a-fA-F]{6}$/.test(colorRaw))
        data.timerColor = colorRaw.toLowerCase();
    }

    await prisma.user.update({ where: { id: session.user.id }, data });
    return NextResponse.json({
      ok: true,
      bahtPerUnit,
      secondsPerUnit,
      initialSeconds,
      maxSeconds,
      timerColor: data.timerColor,
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

  // Alert entrance/exit animation style.
  if (kind === "alertStyle") {
    const style = String(form?.get("style") ?? "");
    if (!isAlertStyle(style)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: session.user.id },
      data: { alertStyle: style },
    });
    revalidateOverlay();
    return NextResponse.json({ ok: true, style });
  }

  // Alert card theme (light gradient card / dark glow card).
  if (kind === "alertTheme") {
    const theme = String(form?.get("theme") ?? "");
    if (!isAlertTheme(theme)) {
      return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: session.user.id },
      data: { alertTheme: theme },
    });
    revalidateOverlay();
    return NextResponse.json({ ok: true, theme });
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

  // Feature hub card "แฟนเลือกเสียง": the sound picker on the donate page.
  if (kind === "soundPickToggle") {
    const enabled = form?.get("enabled") === "1";
    await prisma.user.update({
      where: { id: session.user.id },
      data: { soundPickEnabled: enabled },
    });
    return NextResponse.json({ ok: true, enabled });
  }

  // Feature hub card "คอมโบทิป". Off stops a running combo at once (no summary).
  if (kind === "comboToggle") {
    const enabled = form?.get("enabled") === "1";
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: session.user.id }, data: { comboEnabled: enabled } });
      if (!enabled) await stopComboTx(tx, session.user.id, new Date());
    });
    return NextResponse.json({ ok: true, enabled });
  }

  // Feature hub card "ขอคลิป/เพลง". Off: nothing new plays (the queue keeps
  // confirmed clips; a playing one goes back to the top — src/lib/media-queue.ts).
  if (kind === "mediaToggle") {
    const enabled = form?.get("enabled") === "1";
    await setMediaEnabled(session.user.id, enabled);
    return NextResponse.json({ ok: true, enabled });
  }

  // Feature hub card "ฝากเสียง" (same queue as clips; off re-queues a voice playing).
  if (kind === "voiceToggle") {
    const enabled = form?.get("enabled") === "1";
    await setVoiceEnabled(session.user.id, enabled);
    return NextResponse.json({ ok: true, enabled });
  }

  // Feature hub card "กาชา". Turning it on needs the gacha's own rules
  // (POST /api/gacha/rules); the client opens them on 409.
  if (kind === "gachaToggle") {
    const enabled = form?.get("enabled") === "1";
    const res = await prisma.user.updateMany({
      where: { id: session.user.id, ...(enabled ? { gachaRulesAcceptedAt: { not: null } } : {}) },
      data: { gachaEnabled: enabled },
    });
    if (res.count === 0) return NextResponse.json({ error: "rules" }, { status: 409 });
    return NextResponse.json({ ok: true, enabled });
  }

  // Feature hub card "วงล้อสุ่ม". Turning it on needs the first-enable
  // checklist (POST /api/wheels/rules); the client opens it on 409.
  if (kind === "wheelToggle") {
    const enabled = form?.get("enabled") === "1";
    const res = await prisma.user.updateMany({
      where: { id: session.user.id, ...(enabled ? { wheelRulesAcceptedAt: { not: null } } : {}) },
      data: { wheelEnabled: enabled },
    });
    if (res.count === 0) return NextResponse.json({ error: "rules" }, { status: 409 });
    return NextResponse.json({ ok: true, enabled });
  }

  // A library file's name (shown to fans when they pick a sound).
  if (kind === "libraryName") {
    const assetId = String(form?.get("assetId") ?? "");
    const name = cleanName(form?.get("name"));
    if (!name) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const res = await prisma.alertAsset.updateMany({
      where: { id: assetId, userId: session.user.id },
      data: { name },
    });
    if (res.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, name });
  }

  // Alert library (sounds / stickers / videos), organised in sets.
  if (kind === "librarySound" || kind === "librarySticker" || kind === "libraryVideo") {
    const assetKind = kind === "librarySound" ? "SOUND" : kind === "libraryVideo" ? "VIDEO" : "STICKER";

    if (remove) {
      const assetId = String(form?.get("assetId") ?? "");
      const asset = await prisma.alertAsset.findFirst({
        where: { id: assetId, userId: session.user.id },
      });
      if (asset) {
        // Sets holding it lose the item (FK cascade); bump them so running
        // overlays drop the file from their random pool.
        const inSets = await prisma.alertSetItem.findMany({
          where: { assetId: asset.id },
          select: { setId: true },
        });
        await deleteFile(asset.url); // free the storage before dropping the row
        // Tiers pointing at this file fall back to the normal alert.
        await prisma.$transaction([
          prisma.alertAsset.delete({ where: { id: asset.id } }),
          prisma.alertTier.updateMany({ where: { userId: session.user.id, soundUrl: asset.url }, data: { soundUrl: null } }),
          prisma.alertTier.updateMany({ where: { userId: session.user.id, imageUrl: asset.url }, data: { imageUrl: null } }),
          prisma.alertTier.updateMany({ where: { userId: session.user.id, videoUrl: asset.url }, data: { videoUrl: null } }),
        ]);
        if (inSets.length > 0) {
          await prisma.alertSet.updateMany({
            where: { id: { in: inSets.map((i) => i.setId) } },
            data: { updatedAt: new Date() },
          });
        }
        revalidateOverlay();
      }
      return NextResponse.json({ ok: true, id: assetId });
    }

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "no_file" }, { status: 400 });
    }
    const isSound = assetKind === "SOUND";
    const isVideo = assetKind === "VIDEO";
    const types = isSound ? ALLOWED_AUDIO_TYPES : isVideo ? ALLOWED_VIDEO_TYPES : ALLOWED_ALERT_IMAGE_TYPES;
    const max = isSound ? MAX_LIBRARY_AUDIO_BYTES : isVideo ? MAX_VIDEO_BYTES : MAX_LIBRARY_IMAGE_BYTES;
    if (file.size > max) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    if (!types.includes(file.type) || !(await fileMatchesType(file))) {
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
      isSound ? "alert-lib-sounds" : isVideo ? "alert-lib-videos" : "alert-lib-stickers",
    );
    const created = await prisma.alertAsset.create({
      data: {
        userId: session.user.id,
        kind: assetKind,
        url,
        // The original file name (no extension) until the creator renames it.
        name: cleanName(file.name.replace(/\.[^.]+$/, "").slice(0, MAX_NAME)),
      },
      select: { id: true, url: true, name: true },
    });
    // The library page's upload joins today's set; tier-row and create-set
    // uploads don't (they place the file themselves). Videos never join on
    // upload: one would replace the image and sound of every tip.
    if (form?.get("addToActive") === "1" && !isVideo) {
      const setId = await getActiveSetId(session.user.id);
      await prisma.alertSetItem.create({ data: { setId, assetId: created.id } });
      await touchSet(setId);
    }
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
  if (!cfg.types.includes(file.type) || !(await fileMatchesType(file))) {
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
