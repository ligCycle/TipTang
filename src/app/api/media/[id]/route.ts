import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isMediaAction, mediaQueueAction } from "@/lib/media-queue";

/** A queue button: `{ action: "approve" | "remove" | "skip" | "top" }` (own requests only). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  if (!isMediaAction(body?.action)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const ok = await mediaQueueAction(user.id, id, body.action, new Date());
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
