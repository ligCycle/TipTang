import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * When did the signed-in creator's live program last load their overlay?
 * The OBS page polls this while it waits for the first connection.
 */
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { overlayLastSeenAt: true },
  });
  return NextResponse.json(
    { lastSeenAt: row?.overlayLastSeenAt?.toISOString() ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
