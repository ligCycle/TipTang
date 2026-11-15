import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { normalizeSocialLinks } from "@/lib/socials";
import { requestStillValid, verifiableLinks } from "@/lib/channel-verify";
import { formatDate } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { Icon } from "@/components/Icon";
import { ChannelVerifyAdminRow, type ChannelVerifyRow } from "@/components/ChannelVerifyAdminRow";

/**
 * Server component for /admin: channel-owner badge requests to check by hand
 * (oldest first), then the creators who hold a badge, with revoke. A request
 * whose channel link was edited since is left out (it no longer applies).
 */
export async function ChannelVerifySection({ locale }: { locale: string }) {
  const t = await getTranslations("channelVerify");
  const dateLocale = locale === "th" ? "th-TH" : "en-US";

  const users = await prisma.user.findMany({
    where: { channelVerifyStatus: { in: ["PENDING", "VERIFIED"] } },
    orderBy: { channelVerifyRequestedAt: "asc" },
    select: {
      id: true,
      username: true,
      displayName: true,
      socialLinks: true,
      channelVerifyStatus: true,
      channelVerifyKey: true,
      channelVerifyUrl: true,
      channelVerifyRequestedAt: true,
      channelVerifiedAt: true,
    },
  });

  const pending: (ChannelVerifyRow & { lookFor: string })[] = [];
  const verified: ChannelVerifyRow[] = [];
  for (const u of users) {
    const socials = normalizeSocialLinks(u.socialLinks);
    if (!requestStillValid(u.channelVerifyKey, u.channelVerifyUrl, socials)) continue;
    const link = verifiableLinks(socials).find((l) => l.key === u.channelVerifyKey);
    if (!link) continue;
    const base = { userId: u.id, displayName: u.displayName, username: u.username, platform: link.label, channelUrl: link.url };
    if (u.channelVerifyStatus === "PENDING") {
      const at = u.channelVerifyRequestedAt;
      pending.push({
        ...base,
        dateText: at ? t("adminRequested", { date: formatDate(at, dateLocale) }) : "",
        lookFor: `${SITE_URL.replace(/^https?:\/\//, "")}/${u.username}`,
      });
    } else {
      const at = u.channelVerifiedAt;
      verified.push({ ...base, dateText: at ? t("adminVerifiedAt", { date: formatDate(at, dateLocale) }) : "" });
    }
  }

  return (
    <section>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-brand-900">
        <Icon name="check-circle" className="h-5 w-5" />
        {t("adminTitle")} ({pending.length})
      </h2>
      {pending.length === 0 ? (
        <p className="card rounded-2xl p-6 text-center text-brand-900/60">{t("adminEmpty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {pending.map(({ lookFor, ...row }) => (
            <ChannelVerifyAdminRow key={row.userId} row={row} mode="pending" lookFor={lookFor} />
          ))}
        </ul>
      )}
      {verified.length > 0 && (
        <>
          <h3 className="mb-3 mt-6 font-bold text-brand-900">
            {t("adminVerifiedTitle")} ({verified.length})
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {verified.map((row) => (
              <ChannelVerifyAdminRow key={row.userId} row={row} mode="verified" lookFor="" />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
