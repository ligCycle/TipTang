import { prisma } from "@/lib/prisma";
import { LiveOverlay } from "@/components/overlay/LiveOverlay";
import { DEFAULT_ALERT_THEME, isAlertTheme } from "@/lib/alertThemes";
import { DEFAULT_POSITIONS, isAnchor } from "@/lib/overlay-layout";

/**
 * The single OBS link: one 1920x1080 browser source that shows every enabled
 * feature (alerts, goal, timer) at the position the creator picked.
 */
export default async function LiveOverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ key?: string }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
  const key = typeof sp.key === "string" ? sp.key : "";

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      overlayKey: true,
      alertSoundUrl: true,
      alertImageUrl: true,
      alertVideoUrl: true,
      alertColor: true,
      alertStyle: true,
      alertTheme: true,
      bigTipThreshold: true,
      ttsEnabled: true,
      goalColor: true,
      timerColor: true,
      alertPosition: true,
      goalPosition: true,
      timerPosition: true,
    },
  });

  // Invalid/missing key → render nothing (transparent page).
  if (!user?.overlayKey || user.overlayKey !== key) {
    return null;
  }

  const [assets, tiers] = await Promise.all([
    prisma.alertAsset.findMany({
      where: { userId: user.id },
      select: { kind: true, url: true },
    }),
    prisma.alertTier.findMany({
      where: { userId: user.id },
      orderBy: { minAmount: "asc" },
      select: { minAmount: true, soundUrl: true, imageUrl: true, videoUrl: true, durationSec: true },
    }),
  ]);
  const urlsOf = (kind: string) => assets.filter((a) => a.kind === kind).map((a) => a.url);

  return (
    <LiveOverlay
      username={username}
      apiKey={key}
      tiers={tiers}
      positions={{
        alert: isAnchor(user.alertPosition) ? user.alertPosition : DEFAULT_POSITIONS.alert,
        goal: isAnchor(user.goalPosition) ? user.goalPosition : DEFAULT_POSITIONS.goal,
        timer: isAnchor(user.timerPosition) ? user.timerPosition : DEFAULT_POSITIONS.timer,
      }}
      // Goal / clock follow their own colour, else the alert colour (as the old links do).
      goalColor={user.goalColor ?? user.alertColor}
      timerColor={user.timerColor ?? user.alertColor}
      alert={{
        soundUrl: user.alertSoundUrl,
        imageUrl: user.alertImageUrl,
        videoUrl: user.alertVideoUrl,
        color: user.alertColor,
        ttsEnabled: user.ttsEnabled,
        librarySounds: urlsOf("SOUND"),
        libraryStickers: urlsOf("STICKER"),
        libraryVideos: urlsOf("VIDEO"),
        alertStyle: user.alertStyle,
        alertTheme: isAlertTheme(user.alertTheme) ? user.alertTheme : DEFAULT_ALERT_THEME,
        bigTipThreshold: user.bigTipThreshold,
      }}
    />
  );
}
