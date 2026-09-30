import { NextResponse, after } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resetSchema } from "@/lib/validators";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { forgetSessionVersion } from "@/lib/account-security";
import { sendSecurityAlertEmail } from "@/lib/email";
import { linkBase } from "@/lib/site";

export async function POST(req: Request) {
  const limit = await rateLimit(`reset:${clientIp(req)}`, 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = resetSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { token, password } = parsed.data;

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const rec = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { userId: true, expiresAt: true },
  });

  if (!rec || rec.expiresAt < new Date()) {
    return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  // The emailed link proves the address, and a reset is exactly what someone
  // does after losing control of their account: sign out every device.
  const user = await prisma.user.update({
    where: { id: rec.userId },
    data: {
      passwordHash,
      emailVerifiedAt: new Date(),
      sessionVersion: { increment: 1 },
    },
    select: { email: true, displayName: true },
  });
  forgetSessionVersion(rec.userId);
  // Consume all of this user's reset tokens.
  await prisma.passwordResetToken.deleteMany({ where: { userId: rec.userId } });

  const base = linkBase(req);
  after(async () => {
    try {
      await sendSecurityAlertEmail({
        to: user.email,
        displayName: user.displayName,
        change: "password",
        settingsUrl: `${base}/th/dashboard/settings`,
        forgotUrl: `${base}/th/forgot-password`,
      });
    } catch (err) {
      console.error("[reset-password] alert email failed:", err);
    }
  });

  return NextResponse.json({ ok: true });
}
