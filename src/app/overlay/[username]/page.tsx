import { prisma } from "@/lib/prisma";
import { OverlayClient } from "@/components/OverlayClient";
import { DEFAULT_ALERT_THEME, isAlertTheme } from "@/lib/alertThemes";

export default async function OverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ key?: string; test?: string }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
  const key = typeof sp.key === "string" ? sp.key : "";
  const test = sp.test === "1";

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
    },
  });

  // Invalid/missing key → render nothing (transparent page).
  if (!user?.overlayKey || user.overlayKey !== key) {
    return null;
  }

  const [assets, tierRows] = await Promise.all([
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
  const librarySounds = assets
    .filter((a) => a.kind === "SOUND")
    .map((a) => a.url);
  const libraryStickers = assets
    .filter((a) => a.kind === "STICKER")
    .map((a) => a.url);
  const libraryVideos = assets
    .filter((a) => a.kind === "VIDEO")
    .map((a) => a.url);

  return (
    <OverlayClient
      username={username}
      apiKey={key}
      test={test}
      soundUrl={user.alertSoundUrl}
      imageUrl={user.alertImageUrl}
      videoUrl={user.alertVideoUrl}
      color={user.alertColor}
      ttsEnabled={user.ttsEnabled}
      librarySounds={librarySounds}
      libraryStickers={libraryStickers}
      libraryVideos={libraryVideos}
      tiers={tierRows}
      alertStyle={user.alertStyle}
      alertTheme={isAlertTheme(user.alertTheme) ? user.alertTheme : DEFAULT_ALERT_THEME}
      bigTipThreshold={user.bigTipThreshold}
    />
  );
}
