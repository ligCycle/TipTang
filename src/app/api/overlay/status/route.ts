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
    select: {
      overlayLastSeenAt: true,
      mainSeenAt: true,
      barsSeenAt: true,
      comboOverlaySeenAt: true,
      mediaSeenAt: true,
      bossLinkSeenAt: true,
    },
  });
  const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
  // The OBS bar on every feature page reads the two links' and the own links' times (C11).
  return NextResponse.json(
    {
      lastSeenAt: iso(row?.overlayLastSeenAt),
      mainSeenAt: iso(row?.mainSeenAt),
      barsSeenAt: iso(row?.barsSeenAt),
      comboSeenAt: iso(row?.comboOverlaySeenAt),
      mediaSeenAt: iso(row?.mediaSeenAt),
      bossSeenAt: iso(row?.bossLinkSeenAt),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
