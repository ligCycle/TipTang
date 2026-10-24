import { prisma } from "@/lib/prisma";
import { GachaOverlayClient } from "@/components/overlay/GachaOverlayClient";

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
    select: { overlayKey: true },
  });

  // Invalid/missing key → render nothing (transparent page).
  if (!user?.overlayKey || user.overlayKey !== key) {
    return null;
  }

  return <GachaOverlayClient username={username} apiKey={key} />;
}
