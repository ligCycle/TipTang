import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { deleteFile, deleteSlipsBatch } from "@/lib/storage";
import { slipCutoffs } from "@/lib/retention";

export const dynamic = "force-dynamic";

const BATCH = 200;

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. No secret set → closed. */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

type SlipRow = { id: string; slipKey: string | null; slipUrl: string | null };

/** Delete the files, and report which rows are safe to mark as purged. */
async function purgeFiles(rows: SlipRow[]): Promise<string[]> {
  const keys = rows.map((r) => r.slipKey).filter((k): k is string => !!k);
  const keysGone = await deleteSlipsBatch(keys);
  if (!keysGone) console.error("[purge-slips] private bucket delete failed");
  const done: string[] = [];
  for (const r of rows) {
    // Leave the row alone so tomorrow's run retries its file.
    if (r.slipKey && !keysGone) continue;
    // Legacy public-bucket slips (tips before 2026-09-16, orders before
    // 2026-09-30): best-effort one by one.
    if (r.slipUrl) await deleteFile(r.slipUrl);
    done.push(r.id);
  }
  return done;
}

/**
 * Daily: delete payment-slip images past the retention period (see
 * lib/retention.ts). Rows stay; slipKey/slipUrl are cleared and slipPurgedAt
 * is set so the dashboard can say the slip was removed.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { decided, any } = slipCutoffs(new Date());
  const hasSlip = [{ slipKey: { not: null } }, { slipUrl: { not: null } }];
  const select = { id: true, slipKey: true, slipUrl: true } as const;

  const tips = await prisma.tip.findMany({
    where: {
      slipPurgedAt: null,
      AND: [
        { OR: hasSlip },
        {
          OR: [
            { status: { not: "PENDING" }, createdAt: { lt: decided } },
            { createdAt: { lt: any } },
          ],
        },
      ],
    },
    select,
    take: BATCH,
  });
  const tipIds = await purgeFiles(tips);
  if (tipIds.length > 0) {
    await prisma.tip.updateMany({
      where: { id: { in: tipIds } },
      data: { slipKey: null, slipUrl: null, slipPurgedAt: new Date() },
    });
  }

  const orders = await prisma.shopOrder.findMany({
    where: {
      slipPurgedAt: null,
      AND: [
        { OR: hasSlip },
        {
          OR: [
            { status: { not: "PENDING" }, createdAt: { lt: decided } },
            { createdAt: { lt: any } },
          ],
        },
      ],
    },
    select,
    take: BATCH,
  });
  const orderIds = await purgeFiles(orders);
  if (orderIds.length > 0) {
    await prisma.shopOrder.updateMany({
      where: { id: { in: orderIds } },
      data: { slipKey: null, slipUrl: null, slipPurgedAt: new Date() },
    });
  }

  return NextResponse.json({
    tips: tipIds.length,
    orders: orderIds.length,
    more: tips.length === BATCH || orders.length === BATCH,
  });
}
