import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { profileSchema } from "@/lib/validators";
import { normalizeSocialLinks } from "@/lib/socials";

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
  const {
    displayName,
    username,
    bio,
    promptpayId,
    autoConfirmTips,
    goalTitle,
    goalAmount,
    socialLinks,
  } = parsed.data;

  // Empty amount / 0 clears the goal.
  const goalValue =
    goalAmount === "" || goalAmount === undefined || Number(goalAmount) <= 0
      ? null
      : Number(goalAmount);
  const cleanSocials =
    socialLinks === undefined ? undefined : normalizeSocialLinks(socialLinks);

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
      goalTitle: goalTitle ? goalTitle : null,
      goalAmount: goalValue,
      ...(cleanSocials === undefined ? {} : { socialLinks: cleanSocials }),
    },
  });

  return NextResponse.json({ ok: true });
}
