import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Replace the overlay key. The old key stops working at once, so a URL that
 * leaked on stream (or anywhere else) can't be used to read the tip feed.
 * The creator has to paste the new URLs into OBS.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const key = crypto.randomBytes(24).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { overlayKey: key },
  });
  return NextResponse.json({ key });
}
