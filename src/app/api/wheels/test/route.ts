import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { pushWheelTest } from "@/lib/overlay-test";
import { drawSegment } from "@/lib/wheel";
import { wheelSegments, WHEEL_SELECT } from "@/lib/wheel-server";

/**
 * "ทดสอบหมุนบนจอ OBS": a fake spin of `{ wheelId }` on the wheel link for a
 * few seconds. Redis only — no spin row, no segment removed, nothing in the
 * to-do list.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { wheelId?: unknown } | null;
  const wheelId = typeof body?.wheelId === "string" ? body.wheelId : null;
  const wheel = wheelId ? await prisma.wheel.findFirst({ where: { id: wheelId, userId: user.id }, select: WHEEL_SELECT }) : null;
  if (!wheel) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const seg = drawSegment(wheelSegments(wheel), Math.random);
  if (!seg) return NextResponse.json({ error: "empty" }, { status: 409 });
  const rl = await rateLimit(`overlay-test:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const t = await pushWheelTest(user.id, wheel.id, seg.key);
  return NextResponse.json({ ok: true, id: t.id });
}
