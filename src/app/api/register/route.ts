import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validators";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const limit = await rateLimit(`register:${clientIp(req)}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { email, password, displayName, username } = parsed.data;

  const [emailUser, usernameUser] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
  ]);
  if (emailUser) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }
  if (usernameUser) {
    return NextResponse.json({ error: "username_taken" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, passwordHash, displayName, username },
  });

  return NextResponse.json({ ok: true });
}
