import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { hashToken } from "@/lib/account-security";

const schema = z.object({ token: z.string().min(10).max(200) });

/** Consume an emailed verification token (the page posts it; no GET side effects). */
export async function POST(req: Request) {
  const limit = await rateLimit(`verify:${clientIp(req)}`, 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const rec = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    select: { userId: true, expiresAt: true },
  });
  if (!rec || rec.expiresAt < new Date()) {
    return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { id: rec.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: rec.userId } }),
  ]);
  return NextResponse.json({ ok: true });
}
