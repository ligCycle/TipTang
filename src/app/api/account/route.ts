import { NextResponse, after } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { forgetSessionVersion } from "@/lib/account-security";
import { deleteFile, deleteSlip } from "@/lib/storage";

const schema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().max(200).optional(),
});

/**
 * Permanently delete the signed-in account and everything it owns (PDPA
 * right to erasure): profile, tips received, shop items and orders, alert
 * library, reports, and the stored files behind them. The caller must type
 * their username, and accounts with a password must also enter it — a stolen
 * session alone can't wipe an account.
 */
export async function DELETE(req: Request) {
  const sessionUser = await requireUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const limit = await rateLimit(`account-delete:${sessionUser.id}`, 5, 15 * 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      avatarUrl: true,
      coverUrl: true,
      alertSoundUrl: true,
      alertImageUrl: true,
      alertVideoUrl: true,
      alertAssets: { select: { url: true } },
      shopItems: { select: { imageUrl: true } },
      shopOrders: { select: { slipUrl: true, slipKey: true } },
      tips: { select: { slipUrl: true, slipKey: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (parsed.data.username.toLowerCase() !== user.username) {
    return NextResponse.json({ error: "username_mismatch" }, { status: 400 });
  }
  if (user.passwordHash) {
    const ok =
      !!parsed.data.password &&
      (await bcrypt.compare(parsed.data.password, user.passwordHash));
    if (!ok) {
      return NextResponse.json({ error: "wrong_password" }, { status: 400 });
    }
  }

  // Orders reference shop items with ON DELETE RESTRICT, so remove them
  // before the user row cascades to the items.
  await prisma.$transaction([
    prisma.shopOrder.deleteMany({ where: { creatorId: user.id } }),
    prisma.user.delete({ where: { id: user.id } }),
  ]);
  forgetSessionVersion(user.id);

  // Files go after the rows (best-effort, never fails the request): an orphan
  // file is harmless, a row pointing at a missing file is not.
  const publicUrls = [
    user.avatarUrl,
    user.coverUrl,
    user.alertSoundUrl,
    user.alertImageUrl,
    user.alertVideoUrl,
    ...user.alertAssets.map((a) => a.url),
    ...user.shopItems.map((i) => i.imageUrl),
    ...user.shopOrders.map((o) => o.slipUrl),
    ...user.tips.map((t) => t.slipUrl),
  ];
  const slipKeys = [
    ...user.shopOrders.map((o) => o.slipKey),
    ...user.tips.map((t) => t.slipKey),
  ];
  after(async () => {
    for (const url of publicUrls) await deleteFile(url);
    for (const key of slipKeys) await deleteSlip(key);
  });

  return NextResponse.json({ ok: true });
}
