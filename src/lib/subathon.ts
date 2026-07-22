import { prisma } from "@/lib/prisma";

// When a donation is confirmed, add time to the creator's running subathon
// timer (if enabled + currently running). Best-effort: never throws to the
// caller, and never revives a timer that already hit zero.
export async function addSubathonTime(creatorId: string, amount: number) {
  try {
    const u = await prisma.user.findUnique({
      where: { id: creatorId },
      select: {
        timerEnabled: true,
        timerEndsAt: true,
        timerBahtPerUnit: true,
        timerSecondsPerUnit: true,
        timerMaxSeconds: true,
      },
    });
    if (!u?.timerEnabled || !u.timerEndsAt) return;

    const now = Date.now();
    const endsMs = u.timerEndsAt.getTime();
    if (endsMs <= now) return; // timer already over — don't revive it

    const perBaht =
      u.timerBahtPerUnit > 0 ? u.timerSecondsPerUnit / u.timerBahtPerUnit : 0;
    const addSec = Math.round(amount * perBaht);
    if (addSec <= 0) return;

    let newEndsMs = endsMs + addSec * 1000;
    if (u.timerMaxSeconds && u.timerMaxSeconds > 0) {
      const cap = now + u.timerMaxSeconds * 1000;
      if (newEndsMs > cap) newEndsMs = cap;
    }

    await prisma.user.update({
      where: { id: creatorId },
      data: { timerEndsAt: new Date(newEndsMs) },
    });
  } catch (err) {
    console.error("[subathon] addSubathonTime failed:", err);
  }
}
