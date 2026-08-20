import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/SettingsForm";
import { ConnectedAccounts } from "@/components/ConnectedAccounts";
import { normalizeSocialLinks } from "@/lib/socials";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionUser = await requireUser();
  if (!sessionUser) redirect(`/${locale}/login`);

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    // promptpayId belongs to the owner — safe to load into their OWN edit form.
    select: {
      email: true,
      googleId: true,
      displayName: true,
      username: true,
      bio: true,
      promptpayId: true,
      avatarUrl: true,
      coverUrl: true,
      autoConfirmTips: true,
      socialLinks: true,
      profileColor: true,
    },
  });
  if (!user) return null;

  const googleAuthEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

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
          profileColor: user.profileColor ?? "",
        }}
      />
      <ConnectedAccounts
        googleConnected={Boolean(user.googleId)}
        accountEmail={user.email}
        googleAuthEnabled={googleAuthEnabled}
      />
    </div>
  );
}
