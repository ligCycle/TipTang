import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signedSlipUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Open a shop order's payment slip — same rules as /api/tips/[id]/slip:
 * owner only (404 for anyone else), redirect to a 60-second signed URL.
 * Orders from before slips went private still hold a public URL; those are
 * redirected too so the dashboard never links to raw storage.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const order = await prisma.shopOrder.findUnique({
    where: { id },
    select: { creatorId: true, slipKey: true, slipUrl: true },
  });
  if (!order || order.creatorId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const target = order.slipKey
    ? await signedSlipUrl(order.slipKey, 60)
    : order.slipUrl;
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Local dev storage hands back a relative path; resolve it against the request.
  return NextResponse.redirect(new URL(target, req.url), {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
