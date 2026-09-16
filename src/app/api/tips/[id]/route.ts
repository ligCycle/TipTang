import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applySubathonTip } from "@/lib/subathon";
import { deleteSlip, deleteFile } from "@/lib/storage";

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
  if (action !== "confirm" && action !== "reject") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const tip = await prisma.tip.findUnique({
    where: { id },
    select: { creatorId: true, status: true, amount: true, timerEffect: true },
  });
  if (!tip) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Ownership check — a creator can only act on their own tips.
  if (tip.creatorId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.tip.update({
    where: { id },
    data: {
      status: action === "confirm" ? "CONFIRMED" : "REJECTED",
      confirmedAt: action === "confirm" ? new Date() : null,
    },
  });

  // Add time to a running subathon timer — only on a fresh confirmation
  // (guard against re-confirming an already-confirmed tip).
  if (action === "confirm" && tip.status !== "CONFIRMED") {
    const amount = Number(tip.amount);
    after(() => applySubathonTip(session.user.id, amount, tip.timerEffect));
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tip = await prisma.tip.findUnique({
    where: { id },
    select: { creatorId: true, status: true, slipKey: true, slipUrl: true },
  });
  if (!tip) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Ownership check — a creator can only delete their own tips.
  if (tip.creatorId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Protect the money record: confirmed tips count toward the total, so they
  // can't be deleted (only clear out pending / rejected clutter).
  if (tip.status === "CONFIRMED") {
    return NextResponse.json(
      { error: "cannot_delete_confirmed" },
      { status: 400 },
    );
  }

  await prisma.tip.delete({ where: { id } });
  // The slip is personal data of both parties — it goes with the tip.
  after(async () => {
    await deleteSlip(tip.slipKey);
    await deleteFile(tip.slipUrl);
  });
  return NextResponse.json({ ok: true });
}
