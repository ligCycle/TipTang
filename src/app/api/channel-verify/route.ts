import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeSocialLinks } from "@/lib/socials";
import { CLEARED_VERIFY, verifiableLinks } from "@/lib/channel-verify";

// The creator asks for the channel-owner badge on one of their SAVED channel
// links (read from the DB, never from the body), or cancels it. The founder
// approves by hand in /admin (src/app/api/admin/channel-verify/route.ts).
const bodySchema = z.object({ key: z.string().min(1).max(20) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { socialLinks: true } });
  const link = verifiableLinks(normalizeSocialLinks(user?.socialLinks)).find((l) => l.key === parsed.data.key);
  if (!link) return NextResponse.json({ error: "invalid" }, { status: 400 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      channelVerifyStatus: "PENDING",
      channelVerifyKey: link.key,
      channelVerifyUrl: link.url,
      channelVerifyRequestedAt: new Date(),
      channelVerifiedAt: null,
    },
  });
  return NextResponse.json({ status: "PENDING" });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await prisma.user.update({ where: { id: session.user.id }, data: { ...CLEARED_VERIFY } });
  return NextResponse.json({ ok: true });
}
