import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";

// Admin only: mark a report resolved or reopen it.
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
  if (action !== "resolve" && action !== "reopen") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  await prisma.report.update({
    where: { id },
    data: { status: action === "resolve" ? "RESOLVED" : "OPEN" },
  });

  return NextResponse.json({ ok: true });
}
