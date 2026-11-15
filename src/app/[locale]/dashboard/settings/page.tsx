import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "@/components/SettingsForm";
import { normalizeSocialLinks } from "@/lib/socials";
import { requestStillValid, verifiableLinks } from "@/lib/channel-verify";
import { SITE_URL } from "@/lib/site";
import { ChannelVerifyCard } from "@/components/ChannelVerifyCard";

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
      displayName: true,
      username: true,
      bio: true,
      promptpayId: true,
      paypalHandle: true,
      thankYouMessage: true,
      avatarUrl: true,
      coverUrl: true,
      autoConfirmTips: true,
      minTipAmount: true,
      socialLinks: true,
      profileColor: true,
      channelVerifyStatus: true,
      channelVerifyKey: true,
      channelVerifyUrl: true,
    },
  });
  if (!user) return null;

  const socials = normalizeSocialLinks(user.socialLinks);
  const links = verifiableLinks(socials);
  // A request for a link that has since changed no longer counts.
  const verifyOk = requestStillValid(user.channelVerifyKey, user.channelVerifyUrl, socials);
  const verifyPlatform = links.find((l) => l.key === user.channelVerifyKey)?.label ?? null;

  return (
    <div className="mx-auto max-w-4xl">
      <SettingsForm
        initial={{
          displayName: user.displayName,
          username: user.username,
          bio: user.bio ?? "",
          promptpayId: user.promptpayId ?? "",
          paypalHandle: user.paypalHandle ?? "",
          thankYouMessage: user.thankYouMessage ?? "",
          avatarUrl: user.avatarUrl ?? "",
          coverUrl: user.coverUrl ?? "",
          autoConfirmTips: user.autoConfirmTips,
          minTipAmount: user.minTipAmount,
          socialLinks: socials,
          profileColor: user.profileColor ?? "",
        }}
      />
      <ChannelVerifyCard
        links={links}
        linkToPaste={`${SITE_URL.replace(/^https?:\/\//, "")}/${user.username}`}
        status={verifyOk ? user.channelVerifyStatus : null}
        platform={verifyOk ? verifyPlatform : null}
      />
    </div>
  );
}
