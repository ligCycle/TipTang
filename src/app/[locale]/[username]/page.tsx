import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { TipForm } from "@/components/TipForm";
import { formatBaht } from "@/lib/format";
import { SOCIAL_PLATFORMS, normalizeSocialLinks } from "@/lib/socials";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; username: string }>;
}): Promise<Metadata> {
  const { locale, username } = await params;
  const creator = await prisma.user.findUnique({
    where: { username },
    select: { displayName: true, bio: true },
  });
  if (!creator) return { title: "Not found" };

  const title =
    locale === "th"
      ? `สนับสนุน ${creator.displayName} — รับทิปผ่าน PromptPay`
      : `Support ${creator.displayName} — tip via PromptPay`;
  const description =
    creator.bio ||
    (locale === "th"
      ? `สนับสนุน ${creator.displayName} ด้วยการทิปผ่าน PromptPay ฟรี ไม่มีค่าธรรมเนียม บน TipTang`
      : `Support ${creator.displayName} with a tip via PromptPay on TipTang.`);
  return {
    title,
    description,
    alternates: {
      canonical: `/${locale}/${username}`,
      languages: {
        th: `/th/${username}`,
        en: `/en/${username}`,
        "x-default": `/th/${username}`,
      },
    },
    openGraph: { title: `${title} · TipTang`, description, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string; username: string }>;
}) {
  const { locale, username } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("profile");

  const creator = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      coverUrl: true,
      // promptpayId is selected only to derive `canTip` below — it is NEVER
      // passed to a client component or rendered (PDPA).
      promptpayId: true,
      goalTitle: true,
      goalAmount: true,
      socialLinks: true,
    },
  });
  if (!creator) notFound();

  const canTip = Boolean(creator.promptpayId && creator.promptpayId.length > 0);

  const [tips, confirmedAgg, topGroups] = await Promise.all([
    prisma.tip.findMany({
      where: {
        creatorId: creator.id,
        status: "CONFIRMED",
        isMessagePublic: true,
      },
      orderBy: { confirmedAt: "desc" },
      take: 20,
      select: {
        id: true,
        supporterName: true,
        message: true,
        amount: true,
        confirmedAt: true,
      },
    }),
    prisma.tip.aggregate({
      where: { creatorId: creator.id, status: "CONFIRMED" },
      _sum: { amount: true },
    }),
    // Leaderboard: total per named supporter (opted-in = isMessagePublic).
    prisma.tip.groupBy({
      by: ["supporterName"],
      where: {
        creatorId: creator.id,
        status: "CONFIRMED",
        isMessagePublic: true,
        supporterName: { not: "" },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }),
  ]);

  const topSupporters = topGroups.map((g) => ({
    name: g.supporterName,
    total: Number(g._sum.amount ?? 0),
  }));
  const medals = ["🥇", "🥈", "🥉"];

  const socials = normalizeSocialLinks(creator.socialLinks);
  const goalAmount = creator.goalAmount ? Number(creator.goalAmount) : 0;
  const raised = Number(confirmedAgg._sum.amount ?? 0);
  const goalPct =
    goalAmount > 0 ? Math.min(100, Math.round((raised / goalAmount) * 100)) : 0;

  const initial = creator.displayName.charAt(0).toUpperCase();
  const currencyLocale = locale === "th" ? "th-TH" : "en-US";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    inLanguage: locale,
    mainEntity: {
      "@type": "Person",
      name: creator.displayName,
      alternateName: `@${creator.username}`,
      url: `https://tiptang.com/${locale}/${creator.username}`,
      ...(creator.bio ? { description: creator.bio } : {}),
      ...(creator.avatarUrl ? { image: creator.avatarUrl } : {}),
    },
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Profile header */}
      <section className="card overflow-hidden rounded-3xl text-center">
        {/* Cover */}
        <div className="h-32 w-full bg-gradient-to-br from-brand-300 to-brand-500 sm:h-40">
          {creator.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="px-8 pb-8">
          {/* Avatar (overlaps cover) */}
          <div className="mx-auto -mt-12 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-brand-400 to-brand-600 text-4xl font-black text-white shadow-lg">
            {creator.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={creator.avatarUrl}
                alt={creator.displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-brand-900">
            {creator.displayName}
          </h1>
          <p className="text-sm font-medium text-brand-600">
            @{creator.username}
          </p>
          {creator.bio && (
            <p className="mx-auto mt-3 max-w-md text-brand-900/70">
              {creator.bio}
            </p>
          )}

          {/* Social links */}
          {SOCIAL_PLATFORMS.some((p) => socials[p.key]) && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {SOCIAL_PLATFORMS.filter((p) => socials[p.key]).map((p) => (
                <a
                  key={p.key}
                  href={socials[p.key]}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={p.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-lg transition hover:scale-110 hover:bg-brand-200"
                >
                  {p.icon}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Fundraising goal */}
      {goalAmount > 0 && (
        <section className="card rounded-2xl p-5">
          <div className="mb-2 flex items-end justify-between gap-3">
            <span className="font-semibold text-brand-900">
              🎯 {creator.goalTitle || t("goalDefaultTitle")}
            </span>
            <span className="text-sm font-bold text-brand-600">{goalPct}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-brand-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
              style={{ width: `${goalPct}%` }}
            />
          </div>
          <p className="mt-2 text-sm text-brand-900/70">
            {t("goalProgress", {
              raised: formatBaht(raised, currencyLocale),
              goal: formatBaht(goalAmount, currencyLocale),
            })}
          </p>
        </section>
      )}

      {/* Top supporters leaderboard — above the form so it's visible */}
      {topSupporters.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-brand-900">
            🏆 {t("topSupporters")}
          </h2>
          <ul className="space-y-2">
            {topSupporters.map((s, i) => (
              <li
                key={s.name}
                className={`card flex items-center justify-between gap-3 rounded-2xl p-4 ${
                  i === 0 ? "ring-1 ring-brand-300" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-7 shrink-0 text-center text-lg font-black text-brand-500">
                    {medals[i] ?? i + 1}
                  </span>
                  <span className="truncate font-semibold text-brand-800">
                    {s.name}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-brand-100 px-3 py-0.5 text-sm font-bold text-brand-700">
                  {formatBaht(s.total, currencyLocale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tip form */}
      {canTip ? (
        <TipForm username={creator.username} creatorName={creator.displayName} />
      ) : (
        <div className="card rounded-2xl p-6 text-center text-brand-900/70">
          {t("notConfigured")}
        </div>
      )}

      {/* Message wall */}
      <section>
        <h2 className="mb-4 text-lg font-bold text-brand-900">
          {t("recentSupporters")}
        </h2>
        {tips.length === 0 ? (
          <p className="card rounded-2xl p-6 text-center text-brand-900/60">
            {t("noSupporters")}
          </p>
        ) : (
          <ul className="space-y-3">
            {tips.map((tip) => (
              <li key={tip.id} className="card rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-brand-800">
                    {tip.supporterName || t("namePlaceholder")}
                  </span>
                  <span className="rounded-full bg-brand-100 px-3 py-0.5 text-sm font-bold text-brand-700">
                    {formatBaht(Number(tip.amount), currencyLocale)}
                  </span>
                </div>
                {tip.message && (
                  <p className="mt-2 text-brand-900/75">{tip.message}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
