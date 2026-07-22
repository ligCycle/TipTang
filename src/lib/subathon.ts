import { prisma } from "@/lib/prisma";

// When a donation is confirmed, add time to the creator's subathon timer.
// Works whether the timer is running (bumps the end time) or paused (banks the
// seconds so no time is lost). A stopped/reset timer is left alone — the
// subathon only accrues once the creator has started it. Best-effort: never
// throws to the caller, and never revives a running timer that already hit 0.
export async function addSubathonTime(creatorId: string, amount: number) {
  try {
    const u = await prisma.user.findUnique({
      where: { id: creatorId },
      select: {
        timerEnabled: true,
        timerEndsAt: true,
        timerRemaining: true,
        timerBahtPerUnit: true,
        timerSecondsPerUnit: true,
        timerMaxSeconds: true,
      },
    });
    if (!u?.timerEnabled) return;

    const perBaht =
      u.timerBahtPerUnit > 0 ? u.timerSecondsPerUnit / u.timerBahtPerUnit : 0;
    const addSec = Math.round(amount * perBaht);
    if (addSec <= 0) return;

    const now = Date.now();
    const cap = u.timerMaxSeconds && u.timerMaxSeconds > 0 ? u.timerMaxSeconds : null;

    if (u.timerEndsAt) {
      // Running — extend the countdown target.
      const endsMs = u.timerEndsAt.getTime();
      if (endsMs <= now) return; // already over — don't revive
      let newEndsMs = endsMs + addSec * 1000;
      if (cap !== null) {
        const capMs = now + cap * 1000;
        if (newEndsMs > capMs) newEndsMs = capMs;
      }
      await prisma.user.update({
        where: { id: creatorId },
        data: { timerEndsAt: new Date(newEndsMs) },
      });
    } else if (u.timerRemaining != null) {
      // Paused — bank the seconds so the creator doesn't lose them.
      let rem = u.timerRemaining + addSec;
      if (cap !== null && rem > cap) rem = cap;
      await prisma.user.update({
        where: { id: creatorId },
        data: { timerRemaining: rem },
      });
    }
    // else: stopped/reset — the subathon hasn't started, so nothing accrues.
  } catch (err) {
    console.error("[subathon] addSubathonTime failed:", err);
  }
}
