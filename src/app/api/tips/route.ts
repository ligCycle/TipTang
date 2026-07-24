import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
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
import { censorText } from "@/lib/profanity";
import { addSubathonTime } from "@/lib/subathon";

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

  // Censor offensive words in the public-facing name + message (keeps the
  // stream/overlay/leaderboard clean).
  const cleanName = censorText(parsed.data.supporterName);
  const cleanMessage = censorText(parsed.data.message);

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

  // Screen the slip with the verifier (Gemini/SlipOK/EasySlip — no-op unless a
  // provider is configured). We compute a verdict for EVERY slip and store it
  // as a dashboard flag; auto-confirm is reserved for a clean "match".
  const verify = await verifySlip(slip);
  if (!verify.ok && verify.reason === "duplicate") {
    return NextResponse.json({ error: "duplicate_slip" }, { status: 409 });
  }
  // Did a verifier actually run? (false only when no provider is configured.)
  const verifierRan = verify.ok || verify.reason !== "disabled";

  let status: "PENDING" | "CONFIRMED" = "PENDING";
  let transRef: string | null = null;
  let autoVerified = false;
  let confirmedAt: Date | null = null;
  // Verdict flag for the dashboard. NULL when no verifier ran.
  let verifyCode: string | null = null;
  let verifyDetail: string | null = null;

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
      verifyCode = "match";
    } else if (!amountOk) {
      // The slip's amount differs from what the supporter entered.
      verifyCode = "amount";
      verifyDetail = formatBaht(verify.amount, "th-TH");
    } else {
      // Amount is right but the money didn't go to this creator.
      verifyCode = "receiver";
    }
  } else if (verify.reason === "invalid") {
    // Verifier read the image but it isn't a (matching) transfer slip.
    verifyCode = "notslip";
  } else if (verify.reason === "timeout" || verify.reason === "error") {
    // Verifier couldn't finish (slow/blurry/network) — hold for manual review.
    verifyCode = "unreadable";
  }

  // Auto-confirm ONLY a clean match, and ONLY when the creator opted in. Every
  // other verdict (mismatch / unreadable) stays PENDING so a suspicious slip is
  // never signed off automatically — the creator reviews it (guided by the flag).
  if (verifyCode === "match" && creator.autoConfirmTips) {
    status = "CONFIRMED";
    autoVerified = true;
    confirmedAt = new Date();
  } else if (!verifierRan && creator.autoConfirmTips) {
    // Backward-compat: no verifier configured + creator trusts slips (they watch
    // their bank) — confirm on arrival, as before. NOT slip verification.
    status = "CONFIRMED";
    confirmedAt = new Date();
  }

  const slipUrl = await uploadImage(slip, "slips");

  const tip = await prisma.tip.create({
    data: {
      creatorId: creator.id,
      supporterName: cleanName,
      message: cleanMessage,
      amount: parsed.data.amount,
      isMessagePublic,
      slipUrl,
      status,
      transRef,
      autoVerified,
      confirmedAt,
      verifyCode,
      verifyDetail,
    },
    select: { id: true },
  });

  // Confirmed on arrival (auto-verified or auto-confirm) → add subathon time.
  if (status === "CONFIRMED") {
    after(() => addSubathonTime(creator.id, parsed.data.amount));
  }

  // Notify the creator by email after the response is sent (best-effort — never
  // block or fail the tip on email problems).
  const origin = new URL(req.url).origin;
  const amountLabel = formatBaht(parsed.data.amount, "th-TH");
  after(async () => {
    try {
      await sendTipNotificationEmail({
        to: creator.email,
        creatorName: creator.displayName,
        supporterName: cleanName,
        amount: amountLabel,
        message: cleanMessage || null,
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

// Bulk-clear the signed-in creator's REJECTED tips (dashboard "clear all
// rejected" button). Confirmed tips are never touched.
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await prisma.tip.deleteMany({
    where: { creatorId: session.user.id, status: "REJECTED" },
  });
  return NextResponse.json({ ok: true, count: result.count });
}
