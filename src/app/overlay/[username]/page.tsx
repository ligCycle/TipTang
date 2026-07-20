import { prisma } from "@/lib/prisma";
import { OverlayClient } from "@/components/OverlayClient";

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
      overlayKey: true,
      alertSoundUrl: true,
      alertImageUrl: true,
      alertVideoUrl: true,
    },
  });

  // Invalid/missing key → render nothing (transparent page).
  if (!user?.overlayKey || user.overlayKey !== key) {
    return null;
  }

  return (
    <OverlayClient
      username={username}
      apiKey={key}
      test={test}
      soundUrl={user.alertSoundUrl}
      imageUrl={user.alertImageUrl}
      videoUrl={user.alertVideoUrl}
    />
  );
}
