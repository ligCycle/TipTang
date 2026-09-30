import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/validators";
import { normalizeSocialLinks } from "@/lib/socials";
import { normalizePaypalHandle } from "@/lib/paypal";
import { sendSecurityAlertEmail } from "@/lib/email";
import { maskPayout } from "@/lib/mask";
import { linkBase } from "@/lib/site";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    // Name EVERY offending field so the form can mark them all at once.
    const fields = [
      ...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? ""))),
    ];
    if (
      typeof body?.paypalHandle === "string" &&
      normalizePaypalHandle(body.paypalHandle) === "invalid"
    ) {
      fields.push("paypalHandle");
    }
    return NextResponse.json({ error: "invalid", fields }, { status: 400 });
  }
  const {
    displayName,
    username,
    bio,
    promptpayId,
    autoConfirmTips,
    minTipAmount,
    paypalHandle,
    thankYouMessage,
    goalTitle,
    goalAmount,
    socialLinks,
    profileColor,
  } = parsed.data;

  // undefined = field not sent (leave as is); null = cleared.
  const paypal =
    paypalHandle === undefined
      ? undefined
      : normalizePaypalHandle(paypalHandle);
  if (paypal === "invalid") {
    return NextResponse.json(
      { error: "invalid", fields: ["paypalHandle"] },
      { status: 400 },
    );
  }

  // Goal is edited from the dashboard OBS card, not here — only touch these
  // fields when the client actually sends them. Empty amount / 0 clears it.
  const goalTitleUpdate =
    goalTitle === undefined ? {} : { goalTitle: goalTitle ? goalTitle : null };
  const goalAmountUpdate =
    goalAmount === undefined
      ? {}
      : {
          goalAmount:
            goalAmount === "" || Number(goalAmount) <= 0
              ? null
              : Number(goalAmount),
        };
  const cleanSocials =
    socialLinks === undefined ? undefined : normalizeSocialLinks(socialLinks);

  // Ensure the username isn't taken by someone else.
  const clash = await prisma.user.findFirst({
    where: { username, NOT: { id: session.user.id } },
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json({ error: "username_taken" }, { status: 409 });
  }

  // Payout details decide where supporters' money goes — remember the old
  // values so the owner can be told when they change.
  const before = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { promptpayId: true, paypalHandle: true },
  });
  const newPromptpay = promptpayId ? promptpayId : null;

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    select: { email: true, displayName: true },
    data: {
      displayName,
      username,
      bio: bio ? bio : null,
      promptpayId: newPromptpay,
      ...(autoConfirmTips === undefined ? {} : { autoConfirmTips }),
      ...(minTipAmount === undefined ? {} : { minTipAmount }),
      ...(paypal === undefined ? {} : { paypalHandle: paypal }),
      ...(thankYouMessage === undefined
        ? {}
        : { thankYouMessage: thankYouMessage || null }),
      ...goalTitleUpdate,
      ...goalAmountUpdate,
      ...(cleanSocials === undefined ? {} : { socialLinks: cleanSocials }),
      ...(profileColor === undefined
        ? {}
        : { profileColor: profileColor ? profileColor : null }),
    },
  });

  const changes: { change: "promptpay" | "paypal"; detail: string }[] = [];
  if (before && (before.promptpayId ?? null) !== newPromptpay) {
    changes.push({
      change: "promptpay",
      detail: newPromptpay ? maskPayout(newPromptpay) : "ค่าว่าง (ปิดรับพร้อมเพย์)",
    });
  }
  if (before && paypal !== undefined && (before.paypalHandle ?? null) !== paypal) {
    // The handle is public on the donate page anyway — show it whole.
    changes.push({ change: "paypal", detail: paypal ?? "ค่าว่าง (ปิดรับ PayPal)" });
  }
  if (changes.length > 0) {
    const base = linkBase(req);
    after(async () => {
      for (const c of changes) {
        try {
          await sendSecurityAlertEmail({
            to: updated.email,
            displayName: updated.displayName,
            ...c,
            settingsUrl: `${base}/th/dashboard/settings`,
            forgotUrl: `${base}/th/forgot-password`,
          });
        } catch (err) {
          console.error("[profile] payout alert email failed:", err);
        }
      }
    });
  }

  return NextResponse.json({ ok: true, paypalHandle: paypal ?? null });
}
