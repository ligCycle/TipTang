import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signedSlipUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The only way to open a donation slip. Checks that the signed-in user owns
 * the tip, then redirects to a signed URL that dies after 60 seconds. A
 * non-owner gets 404 (not 403) so the route does not confirm that a tip id
 * exists. Legacy rows that still hold a public URL are redirected too, so the
 * dashboard never links to raw storage even before they are migrated.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tip = await prisma.tip.findUnique({
    where: { id },
    select: { creatorId: true, slipKey: true, slipUrl: true },
  });
  if (!tip || tip.creatorId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const target = tip.slipKey ? await signedSlipUrl(tip.slipKey, 60) : tip.slipUrl;
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.redirect(target, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
