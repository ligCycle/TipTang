import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportSchema } from "@/lib/validators";
import { rateLimit, clientIp } from "@/lib/ratelimit";

// Auth required: a creator sends a report / issue / suggestion to the admin.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = await rateLimit(`report:${clientIp(req)}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Snapshot the sender's username/email so the admin has context.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.report.create({
    data: {
      userId: session.user.id,
      username: user.username,
      email: user.email,
      category: parsed.data.category,
      message: parsed.data.message,
    },
  });

  return NextResponse.json({ ok: true });
}
