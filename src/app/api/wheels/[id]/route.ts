import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanName } from "@/lib/alert-sets";
import { clampSlots, cleanTasks, cleanWheelPrice, MAX_SLOTS, MAX_SEGMENTS, pruneRemoved } from "@/lib/wheel";
import { lockWheelForEdit, toDto } from "@/lib/wheel-server";

type Ctx = { params: Promise<{ id: string }> };

class Invalid extends Error {}

/**
 * Change one wheel. Body may carry any of: `name`, `price`, `slots`,
 * `removeWhenHit`, `tasks` (replace all; rows with an id keep it),
 * `activate: true`, `reset: true`. Runs with the wheel locked so an edit
 * cannot race a spin taking a segment. Returns the saved wheel.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const w = await lockWheelForEdit(tx, id);
      if (!w || w.userId !== user.id) return null;
      const data: { name?: string; price?: number; slots?: number; removeWhenHit?: boolean; removed?: string[] } = {};

      if (body.name !== undefined) {
        const name = cleanName(body.name);
        if (!name) throw new Invalid();
        data.name = name;
      }
      if (body.price !== undefined) {
        const price = cleanWheelPrice(body.price);
        if (price === null) throw new Invalid();
        data.price = price;
      }
      if (typeof body.removeWhenHit === "boolean") data.removeWhenHit = body.removeWhenHit;

      let taskIds = w.tasks.map((t) => t.id);
      if (body.tasks !== undefined) {
        const tasks = cleanTasks(body.tasks);
        if (!tasks) throw new Invalid();
        const own = new Set(taskIds);
        const keep = tasks.filter((t) => t.id && own.has(t.id)).map((t) => t.id!);
        await tx.wheelTaskRow.deleteMany({ where: { wheelId: id, id: { notIn: keep } } });
        taskIds = [];
        for (const [position, t] of tasks.entries()) {
          if (t.id && own.has(t.id)) {
            await tx.wheelTaskRow.update({ where: { id: t.id }, data: { text: t.text, noAction: t.noAction, position } });
            taskIds.push(t.id);
          } else {
            const row = await tx.wheelTaskRow.create({
              data: { wheelId: id, text: t.text, noAction: t.noAction, position },
              select: { id: true },
            });
            taskIds.push(row.id);
          }
        }
        // More tasks may no longer fit the current slots-per-task.
        data.slots = clampSlots(taskIds.length, w.slots);
      }
      if (body.slots !== undefined) {
        const s = body.slots;
        if (typeof s !== "number" || !Number.isInteger(s) || s < 1 || s > MAX_SLOTS || s * taskIds.length > MAX_SEGMENTS) {
          throw new Invalid();
        }
        data.slots = s;
      }
      data.removed = body.reset === true ? [] : pruneRemoved(w.removed, taskIds, data.slots ?? w.slots);

      await tx.wheel.update({ where: { id }, data });
      if (body.activate === true) {
        await tx.user.update({ where: { id: user.id }, data: { activeWheelId: id } });
      }
      return lockWheelForEdit(tx, id);
    });
    if (!saved) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ wheel: toDto(saved) });
  } catch (e) {
    if (e instanceof Invalid) return NextResponse.json({ error: "invalid" }, { status: 400 });
    throw e;
  }
}

/** Delete a wheel — never the one in use. Past spins keep their text. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const w = await prisma.wheel.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!w) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { activeWheelId: true } });
  if (u?.activeWheelId === id) return NextResponse.json({ error: "active" }, { status: 409 });
  await prisma.wheel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
