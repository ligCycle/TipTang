import { prisma } from "@/lib/prisma";
import { OverlayClient } from "@/components/OverlayClient";
import { activeSetMedia } from "@/lib/alert-sets-server";
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
      alertColor: true,
      alertStyle: true,
      alertTheme: true,
      ttsEnabled: true,
    },
  });

  // Invalid/missing key → render nothing (transparent page).
  if (!user?.overlayKey || user.overlayKey !== key) {
    return null;
  }

  const [assets, tierRows, media] = await Promise.all([
    prisma.alertAsset.findMany({
      where: { userId: user.id },
      select: { url: true },
    }),
    prisma.alertTier.findMany({
      where: { userId: user.id },
      orderBy: { minAmount: "asc" },
      select: { minAmount: true, soundUrl: true, imageUrl: true, videoUrl: true, durationSec: true, celebrate: true },
    }),
    // Normal alerts draw from the active set (refreshed live via the feed).
    activeSetMedia(user.id),
  ]);
  // Tiers may use any library file.
  const libraryAll = assets.map((a) => a.url);

  return (
    <OverlayClient
      username={username}
      apiKey={key}
      test={test}
      color={user.alertColor}
      ttsEnabled={user.ttsEnabled}
      normal={media.normal}
      mediaVersion={media.version}
      libraryAll={libraryAll}
      tiers={tierRows}
      alertStyle={user.alertStyle}
      alertTheme={isAlertTheme(user.alertTheme) ? user.alertTheme : DEFAULT_ALERT_THEME}
    />
  );
}
