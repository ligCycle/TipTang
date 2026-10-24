import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { usernameSchema } from "@/lib/validators";
import { currentFor } from "@/lib/pk-server";

// Donate page: the running "two sides" match fans can pick a side in. Solo
// only, names/colours/totals only (Q10); short shared cache.
export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const limit = await rateLimit(`pk-live:${clientIp(req)}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { username } = await params;
  const u = usernameSchema.safeParse(username);
  if (!u.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const creator = await prisma.user.findUnique({ where: { username: u.data }, select: { id: true, pkEnabled: true } });
  const match = creator?.pkEnabled ? await currentFor(creator.id, new Date(), { soloOnly: true }) : null;
  const res = NextResponse.json({ match, serverNow: new Date().toISOString() });
  res.headers.set("Cache-Control", "public, s-maxage=3, stale-while-revalidate=2");
  return res;
}
