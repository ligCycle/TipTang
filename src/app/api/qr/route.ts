import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { qrSchema } from "@/lib/validators";
import { generatePromptPayQr } from "@/lib/promptpay";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const limit = rateLimit(`qr:${clientIp(req)}`, 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = qrSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { username, amount } = parsed.data;

  // Fetch the PromptPay id SERVER-SIDE only. It is never returned to the client.
  const creator = await prisma.user.findUnique({
    where: { username },
    select: { promptpayId: true },
  });
  if (!creator?.promptpayId) {
    return NextResponse.json({ error: "not_configured" }, { status: 404 });
  }

  const { dataUrl } = await generatePromptPayQr(creator.promptpayId, amount);
  // Only the rendered QR image is returned — not the PromptPay id (PDPA).
  return NextResponse.json({ dataUrl });
}
