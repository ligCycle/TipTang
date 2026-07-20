import { setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/SettingsForm";
import { normalizeSocialLinks } from "@/lib/socials";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    // promptpayId belongs to the owner — safe to load into their OWN edit form.
    select: {
      displayName: true,
      username: true,
      bio: true,
      promptpayId: true,
      avatarUrl: true,
      coverUrl: true,
      autoConfirmTips: true,
      socialLinks: true,
    },
  });
  if (!user) return null;

  return (
    <div className="mx-auto max-w-lg">
      <SettingsForm
        initial={{
          displayName: user.displayName,
          username: user.username,
          bio: user.bio ?? "",
          promptpayId: user.promptpayId ?? "",
          avatarUrl: user.avatarUrl ?? "",
          coverUrl: user.coverUrl ?? "",
          autoConfirmTips: user.autoConfirmTips,
          socialLinks: normalizeSocialLinks(user.socialLinks),
        }}
      />
    </div>
  );
}
