import { prisma } from "@/lib/prisma";
import { TopOverlayClient } from "@/components/overlay/TopOverlayClient";

export default async function TopOverlayPage({
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
    select: { overlayKey: true, alertColor: true, topColor: true },
  });

  // Invalid/missing key → render nothing (transparent page).
  if (!user?.overlayKey || user.overlayKey !== key) {
    return null;
  }

  // Its own colour, else the alert colour, else default pink.
  return <TopOverlayClient username={username} apiKey={key} color={user.topColor ?? user.alertColor} />;
}
