import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { cancelDuo, PkError, respondDuo } from "@/lib/pk-server";

/** Creator vs creator: `{ action: "accept" | "decline" | "cancel" }`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "accept" && action !== "decline" && action !== "cancel") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  try {
    if (action === "cancel") await cancelDuo(user.id, id, new Date());
    else await respondDuo(user.id, id, action, new Date());
  } catch (e) {
    if (e instanceof PkError) return NextResponse.json({ error: e.code }, { status: e.code === "not_found" ? 404 : 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
