import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Auth required: return (generating if needed) the creator's overlay key + username.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      overlayKey: true,
      alertSoundUrl: true,
      alertImageUrl: true,
      alertVideoUrl: true,
      alertColor: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let key = user.overlayKey;
  if (!key) {
    key = crypto.randomBytes(24).toString("hex");
    await prisma.user.update({
      where: { id: session.user.id },
      data: { overlayKey: key },
    });
  }

  return NextResponse.json({
    username: user.username,
    key,
    soundUrl: user.alertSoundUrl,
    imageUrl: user.alertImageUrl,
    videoUrl: user.alertVideoUrl,
    color: user.alertColor,
  });
}
