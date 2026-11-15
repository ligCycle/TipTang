import { prisma } from "@/lib/prisma";
import { GachaOverlayClient } from "@/components/overlay/GachaOverlayClient";
import { OverlayLangProvider } from "@/components/overlay/OverlayLang";
import { overlayLangOf } from "@/lib/overlay-text";

export default async function GachaOverlayPage({
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
      <GachaOverlayClient username={username} apiKey={key} />
    </OverlayLangProvider>
  );
}
