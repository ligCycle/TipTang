import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { pushPkTest } from "@/lib/overlay-test";

/** "ทดสอบบนจอ": a scripted sample match on the PK link (never real data). */
export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await pushPkTest(user.id);
  return NextResponse.json({ ok: true });
}
