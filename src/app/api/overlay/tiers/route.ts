import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeTiers } from "@/lib/alert-tiers";

const SELECT = { minAmount: true, soundUrl: true, imageUrl: true, videoUrl: true, durationSec: true } as const;

/** The creator's alert tiers by amount, lowest first. */
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tiers = await prisma.alertTier.findMany({
    where: { userId: user.id },
    orderBy: { minAmount: "asc" },
    select: SELECT,
  });
  return NextResponse.json({ tiers });
}

/**
 * Replace all tiers at once. Every sound/visual must be one of the creator's
 * own library files, so a tier can never point at someone else's upload.
 */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { tiers?: unknown } | null;
  const parsed = normalizeTiers(body?.tiers);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const own = new Set(
    (
      await prisma.alertAsset.findMany({ where: { userId: user.id }, select: { url: true } })
    ).map((a) => a.url),
  );
  for (const t of parsed.tiers) {
    for (const u of [t.soundUrl, t.imageUrl, t.videoUrl]) {
      if (u && !own.has(u)) return NextResponse.json({ error: "invalid" }, { status: 400 });
    }
  }
  await prisma.$transaction([
    prisma.alertTier.deleteMany({ where: { userId: user.id } }),
    prisma.alertTier.createMany({ data: parsed.tiers.map((t) => ({ ...t, userId: user.id })) }),
  ]);
  revalidatePath("/overlay/[username]", "page");
  return NextResponse.json({ tiers: parsed.tiers });
}
