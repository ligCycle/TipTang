import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatBaht } from "@/lib/format";
import { topSupporters } from "@/lib/leaderboard";
import {
  RANGES,
  bangkokDayKey,
  dayBuckets,
  hasChart,
  parseRange,
  rangeStart,
  sumByDay,
  type Range,
} from "@/lib/range";
import { TipList } from "@/components/TipList";
import { UpdatesPill } from "@/components/UpdatesPill";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CopyLink } from "@/components/CopyLink";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { ReviewsSection } from "@/components/ReviewsSection";
import { overlaySetUp } from "@/lib/overlay-connection";
import { ReportButton } from "@/components/ReportButton";
import { SetSwitcher } from "@/components/features/SetSwitcher";
import { SpinTodo } from "@/components/features/SpinTodo";
import { SHOP_ENABLED } from "@/lib/features";
import { Icon } from "@/components/Icon";

const RANGE_LABEL: Record<Range, "rangeToday" | "range7d" | "range30d" | "rangeAll"> = {
  today: "rangeToday",
  "7d": "range7d",
  "30d": "range30d",
  all: "rangeAll",
};

// Top-row actions: one filled button for the thing creators come here to do
// (the OBS overlay), quiet text links for the rest. Guide and settings are
// not repeated here — the site header already links both on every page.
// Tighter padding below sm so the three fit on one line on a phone.
const primaryActionClass =
  "inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 sm:gap-2 sm:px-4";
const quietActionClass =
  "inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-100/70 sm:gap-2 sm:px-3";

const sectionTitleClass =
  "flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const range = parseRange((await searchParams).range);
  const t = await getTranslations("dashboard");
  const tShop = await getTranslations("shop");
  const tCommon = await getTranslations("common");
  const currencyLocale = locale === "th" ? "th-TH" : "en-US";

  const sessionUser = await requireUser();
  if (!sessionUser) redirect(`/${locale}/login`);
  const userId = sessionUser.id;

  // The overview counts by when the tip CAME IN (createdAt), same as the
  // list below is ordered, so "today" means "tips sent today". Day
  // boundaries are Bangkok — see src/lib/range.ts.
  const now = new Date();
  const start = rangeStart(range, now);
  const inRange = {
    creatorId: userId,
    status: "CONFIRMED" as const,
    ...(start ? { createdAt: { gte: start } } : {}),
  };

  // One parallel batch, as before: none of these depend on each other.
  const [user, rangeAgg, rangeTips, top, pendingCount, confirmedEver] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          displayName: true,
          username: true,
          promptpayId: true,
          overlayLastSeenAt: true,
          wheelEnabled: true,
          comboEnabled: true,
        },
      }),
      prisma.tip.aggregate({
        where: inRange,
        _sum: { amount: true },
        _count: true,
      }),
      // Only the chart needs individual rows, and only for 7d/30d.
      hasChart(range)
        ? prisma.tip.findMany({
            where: inRange,
            select: { amount: true, createdAt: true },
          })
        : Promise.resolve([]),
      // The creator sees every supporter, opted-in or not — the tip rows
      // below already show every name.
      topSupporters(userId, { limit: 1, publicOnly: false, since: start }),
      prisma.tip.count({ where: { creatorId: userId, status: "PENDING" } }),
      prisma.tip.count({ where: { creatorId: userId, status: "CONFIRMED" } }),
    ]);
  if (!user) {
    return null;
  }

  const received = Number(rangeAgg._sum.amount ?? 0);
  const tipsInRange = rangeAgg._count;
  const topSupporter = top[0] ?? null;
  const chart = hasChart(range)
    ? sumByDay(
        dayBuckets(range, now),
        rangeTips.map((tip) => ({
          day: bangkokDayKey(tip.createdAt),
          amount: Number(tip.amount),
        })),
      )
    : null;
  const barDate = new Intl.DateTimeFormat(currencyLocale, {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  });

  const profilePath = `/${locale}/${user.username}`;
  // Shown in full (e.g. tiptang.com/th/name) so creators see what fans get.
  const host = (await headers()).get("host") ?? "tiptang.com";


  return (
    <div className="space-y-8">
      {/* Keep the tip list fresh without a manual reload. */}
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-brand-900">
          {t("welcome", { name: user.displayName })}
        </h1>
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href={`/${locale}/dashboard/features`}
            className={`${primaryActionClass} sm:mr-1`}
          >
            <Icon name="monitor" />
            {t("goOverlay")}
          </Link>
          <UpdatesPill
            href={`/${locale}/updates`}
            label={tCommon("updates")}
            newLabel={tCommon("updatesNew")}
            className={quietActionClass}
          />
          {SHOP_ENABLED && (
            <Link href={`/${locale}/dashboard/shop`} className={quietActionClass}>
              <Icon name="shopping-bag" />
              {tShop("dashboardTitle")}
            </Link>
          )}
          <ReportButton className={quietActionClass} />
        </div>
      </div>

      <OnboardingChecklist
        locale={locale}
        promptpayDone={Boolean(user.promptpayId)}
        overlayDone={overlaySetUp(user.overlayLastSeenAt, confirmedEver)}
        firstTipDone={confirmedEver > 0}
      />

      {/* Donate-page link — a row, not a card; right under the checklist since
          sharing it is what creators do most. */}
      <section>
        <h2 className={sectionTitleClass}>
          <Icon name="link" />
          {t("yourLink")}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <code className="break-all rounded-lg bg-brand-50 px-3 py-1.5 text-sm text-brand-800">
            {host}
            {profilePath}
          </code>
          <CopyLink path={profilePath} label={t("copyLink")} copiedLabel={t("copied")} />
          <Link
            href={profilePath}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            {t("viewProfile")} →
          </Link>
        </div>
      </section>

      {/* Today's sound set, one tap before going live. */}
      <SetSwitcher showManage />

      {/* Wheel results still to do (hidden when there are none). */}
      <SpinTodo
        compact
        seeAllPath={user && !user.wheelEnabled && user.comboEnabled ? "/dashboard/features/combo" : "/dashboard/features/wheel"}
      />

      {/* Overview — one range at a time, chosen via ?range= so the page
          stays a server component and the choice survives a reload. */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className={sectionTitleClass}>
            <Icon name="zap" />
            {t("overview")}
          </h2>
          <nav
            aria-label={t("overview")}
            className="flex flex-wrap gap-0.5 rounded-full border border-brand-200 p-0.5"
          >
            {RANGES.map((r) => {
              const active = r === range;
              return (
                <Link
                  key={r}
                  href={{ pathname: `/${locale}/dashboard`, query: { range: r } }}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-brand-600 text-white"
                      : "text-brand-900/70 hover:bg-brand-100"
                  }`}
                >
                  {t(RANGE_LABEL[r])}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-extrabold tabular-nums text-tip-600 sm:text-3xl">
              {formatBaht(received, currencyLocale)}
            </p>
            <p className="mt-0.5 text-xs text-brand-900/60">{t("received")}</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold tabular-nums text-brand-900 sm:text-3xl">
              {tipsInRange}
            </p>
            <p className="mt-0.5 text-xs text-brand-900/60">{t("tipsInRange")}</p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-2xl font-extrabold text-brand-900 sm:text-3xl">
              {topSupporter ? topSupporter.name : "—"}
            </p>
            <p className="mt-0.5 text-xs text-brand-900/60">
              {t("topSupporter")}
              {topSupporter && (
                <>
                  {" · "}
                  <span className="font-semibold tabular-nums text-tip-600">
                    {formatBaht(topSupporter.total, currencyLocale)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {chart && (
          <div className="mt-4 flex h-14 items-end gap-1">
            {chart.map((bar) => (
              <div
                key={bar.key}
                title={t("chartBarTitle", {
                  date: barDate.format(new Date(`${bar.key}T00:00:00+07:00`)),
                  amount: formatBaht(bar.amount, currencyLocale),
                })}
                className={`min-h-0.5 flex-1 rounded-t ${
                  bar.amount > 0 ? "bg-brand-500/70" : "bg-brand-200"
                }`}
                style={bar.amount > 0 ? { height: `${bar.pct}%` } : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {pendingCount > 0 && (
        <Link
          href="#tips"
          className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 hover:underline dark:text-amber-400"
        >
          <Icon name="clock" />
          {t("pendingLine", { count: pendingCount })} →
        </Link>
      )}

      {/* Reviews come from creators who have actually been tipped; the
          landing page only shows the section once there is one to show.
          Above the tip list so a long list can't push it out of sight. */}
      {confirmedEver > 0 && (
        <ReviewsSection reviews={[]} average={0} count={0} invite />
      )}

      {/* Latest tips; the full list lives on /dashboard/tips. */}
      <TipList userId={userId} locale={locale} limit={5} />
    </div>
  );
}
