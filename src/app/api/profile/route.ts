import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/validators";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { displayName, username, bio, promptpayId, autoConfirmTips } =
    parsed.data;

  // Ensure the username isn't taken by someone else.
  const clash = await prisma.user.findFirst({
    where: { username, NOT: { id: session.user.id } },
    select: { id: true },
  });
  if (clash) {
    return NextResponse.json({ error: "username_taken" }, { status: 409 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      displayName,
      username,
      bio: bio ? bio : null,
      promptpayId: promptpayId ? promptpayId : null,
      ...(autoConfirmTips === undefined ? {} : { autoConfirmTips }),
    },
  });

  return NextResponse.json({ ok: true });
}
