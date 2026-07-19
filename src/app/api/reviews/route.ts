import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reviewSchema } from "@/lib/validators";
import { rateLimit, clientIp } from "@/lib/ratelimit";

// Public: anyone can submit a review. It starts PENDING until an admin approves.
export async function POST(req: Request) {
  const limit = rateLimit(`review:${clientIp(req)}`, 3, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  await prisma.review.create({
    data: {
      name: parsed.data.name,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
      status: "PENDING",
    },
  });

  return NextResponse.json({ ok: true });
}
