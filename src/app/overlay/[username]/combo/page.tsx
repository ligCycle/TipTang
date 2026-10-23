import { prisma } from "@/lib/prisma";
import { ComboOverlayClient } from "@/components/overlay/ComboOverlayClient";

export default async function ComboOverlayPage({
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
    select: { overlayKey: true, alertColor: true, comboColor: true },
  });

  // Invalid/missing key → render nothing (transparent page).
  if (!user?.overlayKey || user.overlayKey !== key) {
    return null;
  }

  // Combo follows its own colour, else the alert colour, else default pink.
  return <ComboOverlayClient username={username} apiKey={key} color={user.comboColor ?? user.alertColor} />;
}
