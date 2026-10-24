import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { inviteDuo, PkError } from "@/lib/pk-server";

/**
 * Invite another creator to a PK: `{ username, durationSec }`. Errors stay
 * generic so nobody can probe who has PK on or invitations off.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limit = await rateLimit(`pk-invite:${user.id}`, 10, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { username?: unknown; durationSec?: unknown } | null;
  try {
    await inviteDuo(user.id, body?.username, body?.durationSec, new Date());
  } catch (e) {
    if (e instanceof PkError) return NextResponse.json({ error: e.code === "invalid" ? "cant_invite" : e.code }, { status: e.code === "invalid" ? 400 : 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
