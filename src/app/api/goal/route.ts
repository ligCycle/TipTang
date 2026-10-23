import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { goalSettings, setGoalType } from "@/lib/goal-server";
import { isGoalDisplay, isGoalStyle, isGoalType } from "@/lib/wishlist";

/** Goal settings: type, style, display, the single goal and the items with what each has raised. */
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const s = await goalSettings(user.id);
  return s ? NextResponse.json(s) : NextResponse.json({ error: "not_found" }, { status: 404 });
}

/** Change any of `{ type, style, display }`. Title/amount/round/colour keep their existing asset kinds. */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (body.type !== undefined && !isGoalType(body.type)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (body.style !== undefined && !isGoalStyle(body.style)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (body.display !== undefined && !isGoalDisplay(body.display)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (isGoalType(body.type)) await setGoalType(user.id, body.type);
  const data = {
    ...(isGoalStyle(body.style) ? { goalStyle: body.style } : {}),
    ...(isGoalDisplay(body.display) ? { goalDisplay: body.display } : {}),
  };
  if (Object.keys(data).length > 0) await prisma.user.update({ where: { id: user.id }, data });
  return NextResponse.json(await goalSettings(user.id));
}
