import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isAdminEmail } from "@/lib/admin";
import { stage, nudgeTemplate } from "@/lib/activation";
import { sendActivationNudgeEmail } from "@/lib/email";

// Admin-only. Sends the ONE reminder a creator can ever get, for the stage
// they are stuck at. The guard column is claimed before the email goes out,
// so a double click, two tabs, or a retry can never produce two emails; if
// sending fails we release the claim and report it — "not sent" is the
// failure mode we accept, "sent twice" is not.
const bodySchema = z.object({
  userId: z.string().min(1),
  // Preview mode: only for the admin's own account, never claims the guard.
  test: z.boolean().optional(),
  template: z.enum(["NO_PROMPTPAY", "NO_OVERLAY"]).optional(),
});

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { userId, test, template: requested } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      promptpayId: true,
      overlayLastSeenAt: true,
      activationNudgeSentAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (test) {
    // Preview both templates on the founder's own inbox, nothing recorded.
    if (!isAdminEmail(user.email) || !requested) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    try {
      await sendActivationNudgeEmail({
        to: user.email,
        displayName: user.displayName,
        template: requested,
      });
    } catch (err) {
      console.error("[activation-nudge] test send failed:", err);
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }
    return NextResponse.json({ test: true });
  }

  const lastTip = await prisma.tip.findFirst({
    where: { creatorId: user.id, status: "CONFIRMED" },
    orderBy: { confirmedAt: "desc" },
    select: { confirmedAt: true },
  });
  const template = nudgeTemplate(
    stage(
      {
        promptpayId: user.promptpayId,
        overlayLastSeenAt: user.overlayLastSeenAt,
        lastConfirmedTipAt: lastTip?.confirmedAt ?? null,
      },
      new Date(),
    ),
  );
  if (!template) {
    return NextResponse.json({ error: "not_applicable" }, { status: 400 });
  }
  if (user.activationNudgeSentAt) {
    return NextResponse.json(
      { error: "already_sent", sentAt: user.activationNudgeSentAt.toISOString() },
      { status: 409 },
    );
  }

  // Claim first. count === 0 means another request won the race.
  const sentAt = new Date();
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, activationNudgeSentAt: null },
    data: { activationNudgeSentAt: sentAt },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "already_sent" }, { status: 409 });
  }

  try {
    await sendActivationNudgeEmail({
      to: user.email,
      displayName: user.displayName,
      template,
    });
  } catch (err) {
    console.error("[activation-nudge] send failed, releasing claim:", err);
    await prisma.user.update({
      where: { id: user.id },
      data: { activationNudgeSentAt: null },
    });
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ sentAt: sentAt.toISOString() });
}
