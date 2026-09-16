import { prisma } from "@/lib/prisma";
import { nextTimerState } from "@/lib/subathon-math";

export type TimerEffect = "ADD" | "REDUCE" | "NONE";

// When a donation is confirmed, move the creator's subathon timer: ADD time
// (the default), REDUCE it (sabotage, on the creator's terms), or NONE. The
// arithmetic lives in subathon-math.ts; this function only does the I/O.
//
// Read-modify-write happens inside one transaction with the user row locked
// (SELECT … FOR UPDATE), so tips that land at the same moment queue up
// instead of overwriting each other's result. Best-effort: never throws to
// the caller, and never revives a running timer that already hit 0.
export async function applySubathonTip(
  creatorId: string,
  amount: number,
  effect: TimerEffect,
) {
  if (effect === "NONE") return;
  try {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        {
          timerEnabled: boolean;
          timerEndsAt: Date | null;
          timerRemaining: number | null;
          timerBahtPerUnit: number;
          timerSecondsPerUnit: number;
          timerMaxSeconds: number | null;
          timerReduceEnabled: boolean;
          timerReduceBahtPerUnit: number;
          timerReduceSecondsPerUnit: number;
          timerFloorSeconds: number;
        }[]
      >`
        SELECT "timerEnabled", "timerEndsAt", "timerRemaining",
               "timerBahtPerUnit", "timerSecondsPerUnit", "timerMaxSeconds",
               "timerReduceEnabled", "timerReduceBahtPerUnit",
               "timerReduceSecondsPerUnit", "timerFloorSeconds"
        FROM "User" WHERE "id" = ${creatorId} FOR UPDATE
      `;
      const u = rows[0];
      if (!u?.timerEnabled) return;
      // A reduce the creator has since switched off silently becomes nothing.
      if (effect === "REDUCE" && !u.timerReduceEnabled) return;

      const next = nextTimerState(
        {
          endsAtMs: u.timerEndsAt ? u.timerEndsAt.getTime() : null,
          remaining: u.timerRemaining,
        },
        {
          bahtPerUnit: u.timerBahtPerUnit,
          secondsPerUnit: u.timerSecondsPerUnit,
          maxSeconds: u.timerMaxSeconds,
          reduceBahtPerUnit: u.timerReduceBahtPerUnit,
          reduceSecondsPerUnit: u.timerReduceSecondsPerUnit,
          floorSeconds: u.timerFloorSeconds,
        },
        amount,
        effect === "REDUCE",
        Date.now(),
      );
      if (!next) return;

      await tx.user.update({
        where: { id: creatorId },
        data:
          next.endsAtMs != null
            ? { timerEndsAt: new Date(next.endsAtMs) }
            : { timerRemaining: next.remaining },
      });
    });
  } catch (err) {
    console.error("[subathon] applySubathonTip failed:", err);
  }
}
