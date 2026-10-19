import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanName } from "@/lib/alert-sets";
import { DEFAULT_WHEEL_PRICE, MAX_WHEELS, TEMPLATES, type TemplateKey } from "@/lib/wheel";
import { listWheels } from "@/lib/wheel-server";

/** The creator's wheels, which one is in use, and whether the card/rules are on. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = await prisma.user.findUnique({
    where: { id: user.id },
    select: { activeWheelId: true, wheelEnabled: true, wheelRulesAcceptedAt: true },
  });
  return NextResponse.json({
    activeWheelId: u?.activeWheelId ?? null,
    wheelEnabled: Boolean(u?.wheelEnabled),
    rulesAccepted: Boolean(u?.wheelRulesAcceptedAt),
    wheels: await listWheels(user.id),
  });
}

const EMPTY_TASKS: { text: string; noAction?: boolean }[] = [{ text: "ภารกิจ 1" }, { text: "ภารกิจ 2" }];

/** New wheel `{ template?, name? }`. The first wheel becomes the one in use. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const key = body?.template;
  const tpl = typeof key === "string" && Object.hasOwn(TEMPLATES, key) ? TEMPLATES[key as TemplateKey] : null;
  if (key !== undefined && !tpl) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const name = cleanName(body?.name) ?? tpl?.name ?? "วงล้อใหม่";

  if ((await prisma.wheel.count({ where: { userId: user.id } })) >= MAX_WHEELS) {
    return NextResponse.json({ error: "too_many" }, { status: 409 });
  }
  const tasks = tpl?.tasks ?? EMPTY_TASKS;
  const wheel = await prisma.wheel.create({
    data: {
      userId: user.id,
      name,
      price: DEFAULT_WHEEL_PRICE,
      removeWhenHit: tpl?.removeWhenHit ?? false,
      tasks: { create: tasks.map((t, position) => ({ text: t.text, noAction: t.noAction === true, position })) },
    },
    select: { id: true },
  });
  await prisma.user.updateMany({ where: { id: user.id, activeWheelId: null }, data: { activeWheelId: wheel.id } });
  return NextResponse.json({ id: wheel.id });
}
