import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { usernameSchema } from "@/lib/validators";
import { parseYouTube } from "@/lib/media";
import { fetchOEmbed } from "@/lib/youtube";

// Donate page, "ขอคลิป/เพลง": the fan pasted a link — show what will play.
// Only the parsed ID goes to YouTube; the fan's URL is never echoed back.
export async function GET(req: Request) {
  const limit = await rateLimit(`media-preview:${clientIp(req)}`, 20, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const sp = new URL(req.url).searchParams;
  const username = usernameSchema.safeParse(sp.get("u"));
  if (!username.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const creator = await prisma.user.findUnique({
    where: { username: username.data },
    select: { mediaEnabled: true },
  });
  if (!creator?.mediaEnabled) {
    return NextResponse.json({ error: "not_enabled" }, { status: 404 });
  }
  const link = parseYouTube(sp.get("url"));
  if (!link) {
    return NextResponse.json({ error: "bad_link" }, { status: 400 });
  }
  const check = await fetchOEmbed(link.videoId);
  if (!check.ok) {
    return NextResponse.json({ error: "gone" }, { status: 422 });
  }
  return NextResponse.json({
    videoId: link.videoId,
    startSec: link.startSec,
    title: check.title,
    thumb: `https://i.ytimg.com/vi/${link.videoId}/mqdefault.jpg`,
  });
}
