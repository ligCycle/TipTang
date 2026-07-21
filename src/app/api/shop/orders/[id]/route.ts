import { NextResponse } from "next/server";
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
    select: { id: true },
  });
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data =
    action === "confirm"
      ? { status: "CONFIRMED" as const, confirmedAt: new Date() }
      : action === "reject"
        ? { status: "REJECTED" as const }
        : action === "deliver"
          ? { status: "DELIVERED" as const, deliveredAt: new Date() }
          : null;
  if (!data) return NextResponse.json({ error: "invalid" }, { status: 400 });

  await prisma.shopOrder.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
