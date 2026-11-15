import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { topSupporters } from "@/lib/leaderboard";
import { topCountOf, topRangeOf, topSince } from "@/lib/top-board";

/**
 * The signed-in creator's own ranking for the settings preview, for a range
 * and row count they are trying out (works with the card off too).
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const range = topRangeOf(sp.get("range"));
  const items = await topSupporters(user.id, {
    limit: topCountOf(sp.get("count")),
    publicOnly: true,
    since: topSince(range, new Date()),
  });
  return NextResponse.json({ range, items }, { headers: { "Cache-Control": "no-store" } });
}
