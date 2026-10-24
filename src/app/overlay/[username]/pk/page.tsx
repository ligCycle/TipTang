import { prisma } from "@/lib/prisma";
import { PkOverlayClient } from "@/components/overlay/PkOverlayClient";

export default async function PkOverlayPage({
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

  return <PkOverlayClient username={username} apiKey={key} />;
}
