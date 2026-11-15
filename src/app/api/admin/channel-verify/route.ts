import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";

// Admin-only: decide a channel-owner badge request. Each action only applies
// from the state it expects (approve and reject need PENDING, revoke needs
// VERIFIED), so a stale tab or a double click changes nothing.
const bodySchema = z.object({
  userId: z.string().min(1),
  action: z.enum(["approve", "reject", "revoke"]),
});

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { userId, action } = parsed.data;

  const { count } =
    action === "approve"
      ? await prisma.user.updateMany({
          where: { id: userId, channelVerifyStatus: "PENDING" },
          data: { channelVerifyStatus: "VERIFIED", channelVerifiedAt: new Date() },
        })
      : await prisma.user.updateMany({
          where: { id: userId, channelVerifyStatus: action === "reject" ? "PENDING" : "VERIFIED" },
          data: { channelVerifyStatus: "REJECTED", channelVerifiedAt: null },
        });
  return NextResponse.json({ ok: true, changed: count > 0 });
}
