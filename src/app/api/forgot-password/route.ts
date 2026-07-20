import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { forgotSchema } from "@/lib/validators";
import { sendPasswordResetEmail } from "@/lib/email";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const limit = await rateLimit(`forgot:${clientIp(req)}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = forgotSchema.safeParse(body);
  // Always respond ok — never reveal whether an email exists (anti-enumeration).
  if (!parsed.success) return NextResponse.json({ ok: true });

  const { email } = parsed.data;
  const locale = parsed.data.locale ?? "th";

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (user) {
    const raw = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");

    // Invalidate any previous tokens, then issue a fresh one (1h expiry).
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const host =
      req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const proto = req.headers.get("x-forwarded-proto") ?? "http";
    const link = `${proto}://${host}/${locale}/reset-password?token=${raw}`;

    try {
      await sendPasswordResetEmail(email, link, locale);
    } catch (e) {
      console.error("Failed to send reset email:", e);
    }
  }

  return NextResponse.json({ ok: true });
}
