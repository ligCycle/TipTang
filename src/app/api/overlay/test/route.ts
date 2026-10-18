import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { pushTestAlert } from "@/lib/overlay-test";

/**
 * "ทดสอบบนจอ OBS": put a sample alert on the creator's live overlay for a few
 * seconds. Stored only in Redis (src/lib/overlay-test.ts) — never a tip, so it
 * moves no goal, timer or leaderboard and sends no email.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { amount?: unknown } | null;
  const amount = body?.amount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > 100_000) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const rl = await rateLimit(`overlay-test:${user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const t = await pushTestAlert(user.id, amount);
  return NextResponse.json({ ok: true, id: t.id });
}
