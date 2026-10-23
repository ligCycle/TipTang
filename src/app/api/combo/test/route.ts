import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { pushComboTest } from "@/lib/overlay-test";

/**
 * "ทดสอบคอมโบบนจอ OBS": a scripted sample combo on the combo link (~35 s).
 * Redis only — no combo row, no rewards, nothing in the to-do list.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rl = await rateLimit(`overlay-test:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const t = await pushComboTest(user.id);
  return NextResponse.json({ ok: true, id: t.id });
}
