import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { issueVerifyToken } from "@/lib/account-security";
import { sendVerifyEmail } from "@/lib/email";
import { linkBase } from "@/lib/site";

const schema = z.object({ locale: z.enum(["th", "en"]).optional() });

/** Signed-in, still-unverified user asks for a fresh verification link. */
export async function POST(req: Request) {
  const sessionUser = await requireUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limit = await rateLimit(`verify-resend:${sessionUser.id}`, 3, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const locale = (parsed.success && parsed.data.locale) || "th";

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { email: true, emailVerifiedAt: true },
  });
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, already: true });

  const raw = await issueVerifyToken(sessionUser.id);
  try {
    await sendVerifyEmail(
      user.email,
      `${linkBase(req)}/${locale}/verify-email?token=${raw}`,
      locale,
    );
  } catch (err) {
    console.error("[verify-resend] send failed:", err);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
