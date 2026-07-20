import { prisma } from "@/lib/prisma";
import { GoalOverlayClient } from "@/components/GoalOverlayClient";

export default async function GoalOverlayPage({
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
    select: { overlayKey: true, alertColor: true },
  });

  // Invalid/missing key → render nothing (transparent page).
  if (!user?.overlayKey || user.overlayKey !== key) {
    return null;
  }

  return (
    <GoalOverlayClient username={username} apiKey={key} color={user.alertColor} />
  );
}
