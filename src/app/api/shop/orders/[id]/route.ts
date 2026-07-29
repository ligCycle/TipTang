import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Auth required (owner): confirm / reject / mark delivered an order.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;

  const order = await prisma.shopOrder.findFirst({
    where: { id, creatorId: session.user.id },
    select: { id: true, deliverableText: true },
  });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const now = new Date();
  let data: Prisma.ShopOrderUpdateInput | null = null;
  if (action === "confirm") {
    // Digital orders (have a snapshotted deliverable) auto-deliver on confirm —
    // the buyer already gets it on their receipt page.
    data = order.deliverableText
      ? { status: "DELIVERED", confirmedAt: now, deliveredAt: now }
      : { status: "CONFIRMED", confirmedAt: now };
  } else if (action === "reject") {
    data = { status: "REJECTED" };
  } else if (action === "deliver") {
    data = { status: "DELIVERED", deliveredAt: now };
  }
  if (!data) return NextResponse.json({ error: "invalid" }, { status: 400 });

  await prisma.shopOrder.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
