import { prisma } from "@/lib/prisma";
import { MediaOverlayClient } from "@/components/overlay/MediaOverlayClient";
import { OverlayLangProvider } from "@/components/overlay/OverlayLang";
import { overlayLangOf } from "@/lib/overlay-text";

export default async function MediaOverlayPage({
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
    select: { overlayKey: true, overlayLang: true },
  });

  // Invalid/missing key → render nothing (transparent page).
  if (!user?.overlayKey || user.overlayKey !== key) {
    return null;
  }

  return (
    <OverlayLangProvider lang={overlayLangOf(user.overlayLang)}>
      <MediaOverlayClient username={username} apiKey={key} />
    </OverlayLangProvider>
  );
}
