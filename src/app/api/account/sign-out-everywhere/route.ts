import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { revokeSessions } from "@/lib/account-security";

/** End every session of this account, including the caller's. */
export async function POST() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await revokeSessions(user.id);
  return NextResponse.json({ ok: true });
}
