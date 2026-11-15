import { prisma } from "@/lib/prisma";
import { WheelOverlayClient } from "@/components/overlay/WheelOverlayClient";
import { OverlayLangProvider } from "@/components/overlay/OverlayLang";
import { overlayLangOf } from "@/lib/overlay-text";

export default async function WheelOverlayPage({
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
      <WheelOverlayClient username={username} apiKey={key} />
    </OverlayLangProvider>
  );
}
