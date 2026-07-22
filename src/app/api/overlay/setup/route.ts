import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Auth required: return (generating if needed) the creator's overlay key + username.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      overlayKey: true,
      alertSoundUrl: true,
      alertImageUrl: true,
      alertVideoUrl: true,
      alertColor: true,
      ttsEnabled: true,
      goalTitle: true,
      goalAmount: true,
      goalOverlayEnabled: true,
      goalColor: true,
      timerEnabled: true,
      timerBahtPerUnit: true,
      timerSecondsPerUnit: true,
      timerInitialSeconds: true,
      timerMaxSeconds: true,
      timerEndsAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let key = user.overlayKey;
  if (!key) {
    key = crypto.randomBytes(24).toString("hex");
    await prisma.user.update({
      where: { id: session.user.id },
      data: { overlayKey: key },
    });
  }

  const assets = await prisma.alertAsset.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, url: true },
  });

  return NextResponse.json({
    username: user.username,
    key,
    librarySounds: assets
      .filter((a) => a.kind === "SOUND")
      .map((a) => ({ id: a.id, url: a.url })),
    libraryStickers: assets
      .filter((a) => a.kind === "STICKER")
      .map((a) => ({ id: a.id, url: a.url })),
    soundUrl: user.alertSoundUrl,
    imageUrl: user.alertImageUrl,
    videoUrl: user.alertVideoUrl,
    color: user.alertColor,
    ttsEnabled: user.ttsEnabled,
    hasGoal: Boolean(user.goalAmount && Number(user.goalAmount) > 0),
    goalEnabled: user.goalOverlayEnabled,
    goalTitle: user.goalTitle ?? "",
    goalAmount: user.goalAmount ? String(user.goalAmount) : "",
    goalColor: user.goalColor,
    timerEnabled: user.timerEnabled,
    timerBahtPerUnit: user.timerBahtPerUnit,
    timerSecondsPerUnit: user.timerSecondsPerUnit,
    timerInitialSeconds: user.timerInitialSeconds,
    timerMaxSeconds: user.timerMaxSeconds,
    timerRunning: Boolean(user.timerEndsAt),
    timerRemainingSeconds: user.timerEndsAt
      ? Math.max(0, Math.round((user.timerEndsAt.getTime() - Date.now()) / 1000))
      : 0,
  });
}
