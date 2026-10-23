import "server-only";
import type { Prisma } from "@prisma/client";
import { cancelSpinTx } from "@/lib/wheel-server";
import { comboConfirmTx, comboRejectTx, lockCreator } from "@/lib/combo-server";
import { wishConfirmTx, wishRejectTx } from "@/lib/goal-server";

type Tx = Prisma.TransactionClient;

/**
 * Interactive transactions that run the tip features: long enough for every
 * feature on a cold connection, short enough to fail fast instead of piling up.
 */
export const TIP_TX = { timeout: 15_000, maxWait: 5_000 } as const;

/**
 * One place that runs every tip feature when a tip becomes CONFIRMED (call it
 * after the status update, inside the transaction that locked the Tip row).
 * The wheel draw runs earlier, before the status update, because it can block
 * the confirm (409 wheel_empty). Lock order everywhere: Tip → Wheel → User.
 * The creator's User row is locked once here; features after this point run
 * under it and don't lock it again.
 */
export async function onTipConfirmedTx(tx: Tx, tipId: string, now: Date): Promise<void> {
  const tip = await tx.tip.findUnique({ where: { id: tipId }, select: { creatorId: true, status: true } });
  if (!tip || tip.status !== "CONFIRMED") return;
  await lockCreator(tx, tip.creatorId);
  await comboConfirmTx(tx, tipId, now, { locked: true });
  await wishConfirmTx(tx, tipId);
}

/** A CONFIRMED tip was rejected: undo every feature's effect, in the same lock order. */
export async function onTipRejectedTx(tx: Tx, tipId: string, now: Date): Promise<void> {
  await cancelSpinTx(tx, tipId);
  const tip = await tx.tip.findUnique({ where: { id: tipId }, select: { creatorId: true } });
  if (!tip) return;
  await lockCreator(tx, tip.creatorId);
  await comboRejectTx(tx, tipId, now, { locked: true });
  await wishRejectTx(tx, tipId);
}
