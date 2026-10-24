import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentFor, endEarly, invitesFor, pkHistory, PkError, startSolo } from "@/lib/pk-server";

/** The PK page: card state, the match now, the last 10 results. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const now = new Date();
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { pkEnabled: true, autoConfirmTips: true, pkInvitesOff: true },
  });
  if (!u) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    enabled: u.pkEnabled,
    graceSec: u.autoConfirmTips ? 60 : 300,
    current: await currentFor(user.id, now),
    history: await pkHistory(user.id),
    invitesOff: u.pkInvitesOff,
    invites: await invitesFor(user.id, now),
  });
}

/** Start a solo match: `{ nameA?, nameB?, colorA?, colorB?, durationSec }`. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await startSolo(user.id, body, new Date());
  } catch (e) {
    if (e instanceof PkError) {
      return NextResponse.json({ error: e.code }, { status: e.code === "invalid" ? 400 : 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true });
}

/** `{ action: "end" }` ends the running solo match now; `{ invitesOff }` refuses creator invitations. */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: unknown; invitesOff?: unknown } | null;
  if (typeof body?.invitesOff === "boolean") {
    await prisma.user.update({ where: { id: user.id }, data: { pkInvitesOff: body.invitesOff } });
    return NextResponse.json({ ok: true });
  }
  if (body?.action !== "end") return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (!(await endEarly(user.id, new Date()))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
