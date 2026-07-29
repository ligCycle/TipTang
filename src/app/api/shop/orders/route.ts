import { NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { shopOrderSchema } from "@/lib/validators";
import {
  uploadImage,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { verifySlip, receiverMatches } from "@/lib/slip-verify";
import { censorText } from "@/lib/profanity";

// Public: place an order for a shop item. Paid via PromptPay + slip (like Tip).
export async function POST(req: Request) {
  const limit = await rateLimit(`order:${clientIp(req)}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const itemId = String(form.get("itemId") ?? "");
  const item = await prisma.shopItem.findFirst({
    where: { id: itemId, active: true, isArchived: false },
    select: {
      id: true,
      title: true,
      price: true,
      creatorId: true,
      deliverableText: true,
      creator: { select: { promptpayId: true, autoConfirmTips: true } },
    },
  });
  if (!item?.creator?.promptpayId) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }

  const parsed = shopOrderSchema.safeParse({
    buyerName: form.get("buyerName") ?? "",
    buyerContact: form.get("buyerContact") ?? "",
    note: form.get("note") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const slip = form.get("slip");
  if (!(slip instanceof File) || slip.size === 0) {
    return NextResponse.json({ error: "slip_required" }, { status: 400 });
  }
  if (slip.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  if (!ALLOWED_IMAGE_TYPES.includes(slip.type)) {
    return NextResponse.json({ error: "bad_type" }, { status: 415 });
  }

  const price = Number(item.price); // authoritative amount (never trust client)

  // Auto-verify the slip (no-op unless a provider is configured); fail-safe.
  const verify = await verifySlip(slip);
  if (!verify.ok && verify.reason === "duplicate") {
    return NextResponse.json({ error: "duplicate_slip" }, { status: 409 });
  }
  let status: "PENDING" | "CONFIRMED" = "PENDING";
  let transRef: string | null = null;
  let confirmedAt: Date | null = null;
  if (verify.ok) {
    transRef = verify.transRef;
    const dup = await prisma.shopOrder.findUnique({
      where: { transRef },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ error: "duplicate_slip" }, { status: 409 });
    }
    const amountOk = Math.abs(verify.amount - price) < 0.01;
    const receiverOk = receiverMatches(
      item.creator.promptpayId,
      verify.receiverRaw,
    );
    if (amountOk && receiverOk) {
      status = "CONFIRMED";
      confirmedAt = new Date();
    }
  }
  if (status === "PENDING" && item.creator.autoConfirmTips) {
    status = "CONFIRMED";
    confirmedAt = new Date();
  }

  const slipUrl = await uploadImage(slip, "slips");

  // Snapshot the deliverable so the buyer keeps what they paid for even if the
  // creator later edits/archives the item.
  const deliverableText = item.deliverableText ?? null;
  // Digital goods (have a deliverable) deliver instantly on a confirmed payment
  // → skip straight to DELIVERED. Commissions stay CONFIRMED (manual work).
  let finalStatus: "PENDING" | "CONFIRMED" | "DELIVERED" = status;
  let deliveredAt: Date | null = null;
  if (status === "CONFIRMED" && deliverableText) {
    finalStatus = "DELIVERED";
    deliveredAt = new Date();
  }

  const baseData = {
    itemId: item.id,
    creatorId: item.creatorId,
    itemTitle: item.title,
    buyerName: censorText(parsed.data.buyerName),
    buyerContact: parsed.data.buyerContact,
    note: parsed.data.note ? censorText(parsed.data.note) : null,
    amount: price,
    slipUrl,
    status: finalStatus,
    transRef,
    deliverableText,
    confirmedAt,
    deliveredAt,
  };

  // Create with a unique receipt token; regenerate on the (extremely unlikely)
  // token collision. A P2002 on transRef instead means a duplicate slip.
  let receiptToken = "";
  let orderId = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    receiptToken = crypto.randomBytes(24).toString("hex");
    try {
      const order = await prisma.shopOrder.create({
        data: { ...baseData, receiptToken },
        select: { id: true },
      });
      orderId = order.id;
      break;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = String(e.meta?.target ?? "");
        if (target.includes("transRef")) {
          return NextResponse.json({ error: "duplicate_slip" }, { status: 409 });
        }
        if (attempt < 3) continue; // receiptToken collision → retry
      }
      throw e;
    }
  }

  return NextResponse.json({
    ok: true,
    id: orderId,
    confirmed: finalStatus !== "PENDING",
    receiptToken,
  });
}
