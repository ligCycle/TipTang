import "server-only";
import { prisma } from "@/lib/prisma";

/** Positions + on/off flags the feature settings pages need, for one creator. */
export async function featureLayout(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      alertsEnabled: true,
      goalOverlayEnabled: true,
      timerEnabled: true,
      alertPosition: true,
      goalPosition: true,
      timerPosition: true,
    },
  });
  if (!u) return null;
  return {
    alertsEnabled: u.alertsEnabled,
    layout: {
      positions: { alert: u.alertPosition, goal: u.goalPosition, timer: u.timerPosition },
      enabled: { alert: u.alertsEnabled, goal: u.goalOverlayEnabled, timer: u.timerEnabled },
    },
  };
}
