import { NextResponse } from "next/server";
import { overlayUser, touchOverlaySeen } from "@/lib/overlay-feed";
import { todoItems } from "@/lib/wheel-server";

const VISIBLE = 8;

// Polled by the to-do OBS link: the open wheel results, newest last.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const user = await overlayUser(username, new URL(req.url).searchParams.get("key"));
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  touchOverlaySeen(user);
  const open = await todoItems(user.id, "open");
  const shown = open.slice(-VISIBLE);
  return NextResponse.json({
    items: shown.map((i) => ({ id: i.id, taskText: i.taskText, fan: i.fan })),
    more: open.length - shown.length,
  });
}
