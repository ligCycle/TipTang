import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";

// Admin only: approve or reject a review.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  await prisma.review.update({
    where: { id },
    data: { status: action === "approve" ? "APPROVED" : "REJECTED" },
  });

  return NextResponse.json({ ok: true });
}
