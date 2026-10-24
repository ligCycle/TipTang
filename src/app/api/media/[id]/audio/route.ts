import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { mediaQueueListenUrl } from "@/lib/media-queue";

/**
 * "ฟัง": the creator listens to a fan's voice message before approving it.
 * Owner only; answers with a redirect to a short-lived (5 minute) signed URL.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const url = await mediaQueueListenUrl(user.id, id);
  if (!url) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const res = NextResponse.redirect(new URL(url, req.url), 302);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
