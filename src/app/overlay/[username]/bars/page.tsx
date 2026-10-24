import { prisma } from "@/lib/prisma";
import { BarsStage } from "@/components/overlay/BarsStage";

/** The bars OBS link: every bar that stays on screen, stacked (src/components/overlay/BarsStage.tsx). */
export default async function BarsOverlayPage({
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
    select: { overlayKey: true, alertColor: true, goalColor: true, timerColor: true, comboColor: true, bossColor: true },
  });

  // Invalid/missing key → render nothing (transparent page).
  if (!user?.overlayKey || user.overlayKey !== key) {
    return null;
  }

  // Each bar follows its own colour, else the alert colour, else default pink.
  return (
    <BarsStage
      username={username}
      apiKey={key}
      colors={{
        goal: user.goalColor ?? user.alertColor,
        timer: user.timerColor ?? user.alertColor,
        combo: user.comboColor ?? user.alertColor,
        boss: user.bossColor ?? user.alertColor,
      }}
    />
  );
}
