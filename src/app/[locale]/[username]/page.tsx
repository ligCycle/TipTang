import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { goalRaised, goalPercent } from "@/lib/goal";
import { TipForm } from "@/components/TipForm";
import { ShopCheckout } from "@/components/ShopCheckout";
import { SHOP_ENABLED } from "@/lib/features";
import { formatBaht } from "@/lib/format";
import { SOCIAL_PLATFORMS, normalizeSocialLinks } from "@/lib/socials";
import { SocialIcon } from "@/components/SocialIcon";
import { Icon } from "@/components/Icon";

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
      goalStartedAt: true,
      socialLinks: true,
      profileColor: true,
    },
  });
  if (!creator) notFound();

  // Creator-chosen accent color for the profile (null = default brand pink).
  const accent = creator.profileColor || "#ec4899";
  const accentStyle = { ["--accent" as string]: accent };

  const canTip = Boolean(creator.promptpayId && creator.promptpayId.length > 0);

  const [tips, raised, topGroups, shopItemsRaw] = await Promise.all([
    prisma.tip.findMany({
      where: {
        creatorId: creator.id,
        status: "CONFIRMED",
        isMessagePublic: true,
      },
      orderBy: { confirmedAt: "desc" },
      take: 100,
      select: {
        id: true,
        supporterName: true,
        message: true,
        amount: true,
        confirmedAt: true,
      },
    }),
    // Goal bar: tips since the creator last started a new round (all-time
    // when they never have). Not the same as the all-time total on purpose.
    goalRaised(creator.id, creator.goalStartedAt),
    // Leaderboard: total per supporter (opted-in = isMessagePublic).
    // Grouped on a NORMALIZED key, not the raw name: supporters have no
    // account and retype their name on every tip, so "Skye" / "skye" /
    // "Skye " are one person. We fold case + whitespace + invisible chars
    // ONLY. We deliberately do NOT fold Thai tone marks — they change the
    // word (ขาว != ข้าว), so folding them would credit one donor's money
    // to another. Prisma groupBy can only group by a raw column, so this
    // has to be raw SQL.
    // NOTE the DOUBLE backslashes: this is a tagged template, so JS eats
    // one layer first. Postgres receives \u200B / \s and reads them as
    // regex escapes. A single backslash would silently reach Postgres as
    // a bare "s" and collapse the letter s instead of whitespace.
    prisma.$queryRaw<{ display: string; total: string }[]>`
      SELECT
        -- Show the spelling they used most recently, minus any stray
        -- leading combining mark (same reasoning as the GROUP BY below):
        -- it is a typing slip that renders as a floating mark, so there
        -- is no reason to print it back at them.
        regexp_replace(
          (array_agg("supporterName"
             ORDER BY COALESCE("confirmedAt", "createdAt") DESC))[1],
          '^[\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E]+', '') AS display,
        SUM("amount")::text AS total
      FROM "Tip"
      WHERE "creatorId" = ${creator.id}
        AND "status" = 'CONFIRMED'
        AND "isMessagePublic" = true
        AND btrim("supporterName") <> ''
      GROUP BY lower(regexp_replace(
        btrim(regexp_replace(
          regexp_replace(normalize("supporterName", NFC),
                         '\\u200B|\\u200C|\\u200D|\\uFEFF', '', 'g'),
          '\\s+', ' ', 'g')),
        -- Drop Thai combining marks stranded at the START of the name.
        -- A tone mark or above/below vowel must sit ON a consonant; one in
        -- position 0 has nothing to combine with, so it is always a typo
        -- artifact and dropping it cannot change the word. (This is NOT the
        -- same as folding tone marks generally, which we refuse to do.)
        -- Leading vowels เ แ โ ใ ไ (U+0E40-44) are real and stay.
        '^[\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E]+', ''))
      -- Tie-break so equal totals keep a stable order across renders
      -- (whoever reached that total first ranks higher). Without this the
      -- leaderboard reshuffles on every refresh.
      ORDER BY SUM("amount") DESC,
               MIN(COALESCE("confirmedAt", "createdAt")) ASC
      LIMIT 5
    `,
    // Shop items (only when the creator can receive payment + shop is enabled).
    canTip && SHOP_ENABLED
      ? prisma.shopItem.findMany({
          where: { creatorId: creator.id, active: true, isArchived: false },
          orderBy: { createdAt: "desc" },
          take: 24,
          select: {
            id: true,
            type: true,
            title: true,
            description: true,
            price: true,
            imageUrl: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const shopItems = shopItemsRaw.map((s) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    description: s.description,
    price: Number(s.price),
    imageUrl: s.imageUrl,
  }));

  const topSupporters = topGroups
    .map((g) => ({ name: g.display, total: Number(g.total) }))
    // A name made ONLY of stray combining marks strips down to nothing.
    // That supporter is indistinguishable from anonymous, and the query
    // already keeps anonymous tips off the leaderboard — so drop it here
    // too rather than rendering a blank row.
    .filter((s) => s.name !== "");

  const socials = normalizeSocialLinks(creator.socialLinks);
  const goalAmount = creator.goalAmount ? Number(creator.goalAmount) : 0;
  const goalPct = goalPercent(raised, goalAmount);

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

  const accentGradient = `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent}, black 25%))`;

  // How many recent supporters show before the list folds. Matches the
  // leaderboard so the two sidebar lists have the same visual weight.
  const RECENT_VISIBLE = 5;
  const renderTip = (tip: (typeof tips)[number]) => (
    <li key={tip.id} className="py-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate font-medium text-brand-800">
          {tip.supporterName || t("namePlaceholder")}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-700">
          {formatBaht(Number(tip.amount), currencyLocale)}
        </span>
      </div>
      {tip.message && (
        <p className="mt-1 text-sm text-brand-900/70">{tip.message}</p>
      )}
    </li>
  );

  return (
    <div
      className="mx-auto max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-8"
      style={accentStyle}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Profile header — full width and NOT a card. The tip form below is the
          only card on the page, so that is where the eye lands. DOM order here
          (header → form → sidebar) is also the mobile order; the grid only
          rearranges it at lg. */}
      <header className="lg:col-span-2">
        <div
          className="h-24 w-full overflow-hidden rounded-3xl sm:h-32"
          style={{ backgroundImage: accentGradient }}
        >
          {creator.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-2 sm:px-4">
          {/* Avatar overlaps the bottom edge of the cover */}
          <div
            className="-mt-10 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white text-3xl font-black text-white shadow-lg"
            style={{ backgroundImage: accentGradient }}
          >
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
          <div className="min-w-0 flex-1 pt-2">
            <h1 className="text-2xl font-extrabold text-brand-900 sm:text-3xl">
              {creator.displayName}
            </h1>
            <p className="text-sm font-medium" style={{ color: accent }}>
              @{creator.username}
            </p>
          </div>
          {SOCIAL_PLATFORMS.some((p) => socials[p.key]) && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {SOCIAL_PLATFORMS.filter((p) => socials[p.key]).map((p) => (
                <a
                  key={p.key}
                  href={socials[p.key]}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={p.label}
                  aria-label={p.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-black/5 bg-white shadow-sm transition hover:scale-110 hover:shadow"
                >
                  <SocialIcon platform={p.key} />
                </a>
              ))}
            </div>
          )}
        </div>
        {creator.bio && (
          <p className="mt-3 max-w-2xl px-2 text-brand-900/70 sm:px-4">
            {creator.bio}
          </p>
        )}
      </header>

      {/* Main column — the one card on the page */}
      <div className="mt-6 space-y-8">
        {canTip ? (
          <TipForm
            username={creator.username}
            creatorName={creator.displayName}
            accentColor={accent}
          />
        ) : (
          <div className="card rounded-2xl p-6 text-center text-brand-900/70">
            {t("notConfigured")}
          </div>
        )}

        {shopItems.length > 0 && (
          <ShopCheckout
            username={creator.username}
            items={shopItems}
            accentColor={accent}
          />
        )}
      </div>

      {/* Sidebar — social proof. Headings and dividers, no boxes, so it
          reads as context rather than competing with the form. */}
      <aside className="mt-8 space-y-8 lg:mt-6">
        {goalAmount > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
                <Icon name="target" />
                <span className="truncate">
                  {creator.goalTitle || t("goalDefaultTitle")}
                </span>
              </h2>
              <span
                className="shrink-0 text-sm font-bold tabular-nums"
                style={{ color: accent }}
              >
                {goalPct}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-brand-100">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, goalPct)}%`,
                  backgroundImage: `linear-gradient(to right, ${accent}, color-mix(in srgb, ${accent}, black 20%))`,
                }}
              />
            </div>
            <p className="mt-2 text-sm tabular-nums text-brand-900/70">
              {t("goalProgress", {
                raised: formatBaht(raised, currencyLocale),
                goal: formatBaht(goalAmount, currencyLocale),
              })}
            </p>
          </section>
        )}

        {topSupporters.length > 0 && (
          <section>
            <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
              <Icon name="trophy" />
              {t("topSupporters")}
            </h2>
            <ol className="divide-y divide-brand-900/10">
              {topSupporters.map((s, i) => (
                <li key={s.name} className="flex items-center gap-3 py-2.5">
                  <span
                    className="w-5 shrink-0 text-sm font-black tabular-nums"
                    style={{ color: accent }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-brand-800 ${
                      i === 0 ? "font-bold" : "font-medium"
                    }`}
                  >
                    {s.name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-700">
                    {formatBaht(s.total, currencyLocale)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section>
          <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
            <Icon name="heart" />
            {t("recentSupporters")}
          </h2>
          {tips.length === 0 ? (
            <p className="py-2 text-sm text-brand-900/50">{t("noSupporters")}</p>
          ) : (
            <>
              <ul className="divide-y divide-brand-900/10">
                {tips.slice(0, RECENT_VISIBLE).map(renderTip)}
              </ul>
              {/* The rest folds behind a native <details>: no JS, no state,
                  works before hydration. Labels swap via group-open. */}
              {tips.length > RECENT_VISIBLE && (
                <details className="group">
                  <summary className="flex cursor-pointer select-none list-none items-center gap-2 py-3 text-sm font-medium text-brand-700 hover:text-brand-900 [&::-webkit-details-marker]:hidden">
                    {/* Rotate a wrapping span, not the <svg>: the individual
                        `rotate` property is ignored on an svg root in
                        some engines (seen in Chromium here; Safari too). */}
                    <span className="inline-flex transition-transform group-open:rotate-180">
                      <Icon name="chevron-down" />
                    </span>
                    <span className="group-open:hidden">
                      {t("showMoreSupporters")}
                    </span>
                    <span className="hidden group-open:inline">
                      {t("showLessSupporters")}
                    </span>
                  </summary>
                  <ul className="divide-y divide-brand-900/10 border-t border-brand-900/10">
                    {tips.slice(RECENT_VISIBLE).map(renderTip)}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
      </aside>
    </div>
  );
}
