import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTipNotificationEmail } from "@/lib/email";
import { formatBaht } from "@/lib/format";
import { tipSchema, usernameSchema } from "@/lib/validators";
import {
  uploadImage,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { verifySlip, receiverMatches } from "@/lib/slip-verify";

export async function POST(req: Request) {
  const limit = await rateLimit(`tip:${clientIp(req)}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const username = usernameSchema.safeParse(form.get("username"));
  if (!username.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const creator = await prisma.user.findUnique({
    where: { username: username.data },
    select: {
      id: true,
      promptpayId: true,
      autoConfirmTips: true,
      email: true,
      displayName: true,
    },
  });
  if (!creator?.promptpayId) {
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }

  const parsed = tipSchema.safeParse({
    supporterName: form.get("supporterName") ?? "",
    message: form.get("message") ?? "",
    amount: form.get("amount"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  // Parse checkbox manually (see note in validators.ts).
  const isMessagePublic = form.get("isMessagePublic") === "true";

  // Validate the slip file.
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

  // Auto-verify the slip (no-op unless a provider is configured).
  // Fail-safe: only auto-confirm when verified + amount matches + receiver
  // matches the creator + the slip hasn't been used before.
  const verify = await verifySlip(slip);
  if (!verify.ok && verify.reason === "duplicate") {
    return NextResponse.json({ error: "duplicate_slip" }, { status: 409 });
  }

  let status: "PENDING" | "CONFIRMED" = "PENDING";
  let transRef: string | null = null;
  let autoVerified = false;
  let confirmedAt: Date | null = null;

  if (verify.ok) {
    transRef = verify.transRef;
    // Block reuse of the same bank slip.
    const dup = await prisma.tip.findUnique({
      where: { transRef },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json({ error: "duplicate_slip" }, { status: 409 });
    }
    const amountOk = Math.abs(verify.amount - parsed.data.amount) < 0.01;
    const receiverOk = receiverMatches(creator.promptpayId, verify.receiverRaw);
    if (amountOk && receiverOk) {
      status = "CONFIRMED";
      autoVerified = true;
      confirmedAt = new Date();
    }
  }

  // Creator opted to trust slips (they watch their bank) — confirm on arrival
  // without the manual step. Note: this is NOT slip verification, so it stays
  // off by default.
  if (status === "PENDING" && creator.autoConfirmTips) {
    status = "CONFIRMED";
    confirmedAt = new Date();
  }

  const slipUrl = await uploadImage(slip, "slips");

  const tip = await prisma.tip.create({
    data: {
      creatorId: creator.id,
      supporterName: parsed.data.supporterName,
      message: parsed.data.message,
      amount: parsed.data.amount,
      isMessagePublic,
      slipUrl,
      status,
      transRef,
      autoVerified,
      confirmedAt,
    },
    select: { id: true },
  });

  // Notify the creator by email after the response is sent (best-effort — never
  // block or fail the tip on email problems).
  const origin = new URL(req.url).origin;
  const amountLabel = formatBaht(parsed.data.amount, "th-TH");
  after(async () => {
    try {
      await sendTipNotificationEmail({
        to: creator.email,
        creatorName: creator.displayName,
        supporterName: parsed.data.supporterName,
        amount: amountLabel,
        message: parsed.data.message || null,
        confirmed: status === "CONFIRMED",
        dashboardUrl: `${origin}/th/dashboard`,
      });
    } catch (err) {
      console.error("[tip-email] failed:", err);
    }
  });

  return NextResponse.json({
    ok: true,
    id: tip.id,
    autoVerified,
    confirmed: status === "CONFIRMED",
  });
}
