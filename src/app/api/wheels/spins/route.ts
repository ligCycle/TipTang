import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DONE_KEEP_MS, todoItems } from "@/lib/wheel-server";

/** To-do list ("ภารกิจค้างทำ"): `?status=open` (default) or `done` (last 30 days). */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = new URL(req.url).searchParams.get("status") === "done" ? "done" : "open";
  return NextResponse.json({ items: await todoItems(user.id, status) });
}

/** Tick or untick one item: `{ id, done }`. */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown; done?: unknown; kind?: unknown } | null;
  if (typeof body?.id !== "string" || typeof body.done !== "boolean") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  // Combo rewards (src/lib/combo-server.ts) share the list with wheel results.
  if (body.kind === "combo") {
    const r = await prisma.comboReward.updateMany({
      where: {
        id: body.id,
        userId: user.id,
        ...(body.done ? {} : { doneAt: { gte: new Date(Date.now() - DONE_KEEP_MS) } }),
      },
      data: { doneAt: body.done ? new Date() : null },
    });
    if (r.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  const res = await prisma.spin.updateMany({
    where: {
      id: body.id,
      userId: user.id,
      status: "ACTIVE",
      // Undo only within the window the done list shows.
      ...(body.done ? {} : { doneAt: { gte: new Date(Date.now() - DONE_KEEP_MS) } }),
    },
    data: { doneAt: body.done ? new Date() : null },
  });
  if (res.count === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
