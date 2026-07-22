import { prisma } from "@/lib/prisma";
import { TimerOverlayClient } from "@/components/TimerOverlayClient";

export default async function TimerOverlayPage({
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
    select: { overlayKey: true, alertColor: true, timerColor: true },
  });

  // Invalid/missing key → render nothing (transparent page).
  if (!user?.overlayKey || user.overlayKey !== key) {
    return null;
  }

  // Clock follows its own color, else the alert color, else default pink.
  const color = user.timerColor ?? user.alertColor;

  return (
    <TimerOverlayClient username={username} apiKey={key} color={color} />
  );
}
