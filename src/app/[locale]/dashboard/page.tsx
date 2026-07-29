import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatBaht } from "@/lib/format";
import { TipRow } from "@/components/TipRow";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ClearRejectedButton } from "@/components/ClearRejectedButton";
import { CopyLink } from "@/components/CopyLink";
import { OverlaySettings } from "@/components/OverlaySettings";
import { ReportForm } from "@/components/ReportForm";
import { SHOP_ENABLED } from "@/lib/features";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const tShop = await getTranslations("shop");
  const tCommon = await getTranslations("common");
  const currencyLocale = locale === "th" ? "th-TH" : "en-US";

  const session = await auth();
  const userId = session!.user.id;

  // Fetch the profile + all tip stats in ONE parallel batch (a single DB
  // round trip instead of two back-to-back) to cut the dashboard's server
  // response time. The tip queries don't depend on the user row.
  const [user, tips, confirmedAgg, pendingCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        displayName: true,
        username: true,
        promptpayId: true,
        autoConfirmTips: true,
      },
    }),
    prisma.tip.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        supporterName: true,
        message: true,
        amount: true,
        status: true,
        slipUrl: true,
        autoVerified: true,
        verifyCode: true,
        verifyDetail: true,
        createdAt: true,
      },
    }),
    prisma.tip.aggregate({
      where: { creatorId: userId, status: "CONFIRMED" },
      _sum: { amount: true },
    }),
    prisma.tip.count({ where: { creatorId: userId, status: "PENDING" } }),
  ]);
  if (!user) {
    return null;
  }

  const totalConfirmed = Number(confirmedAgg._sum.amount ?? 0);
  const rejectedCount = tips.filter((tip) => tip.status === "REJECTED").length;
  const hasPromptpay = Boolean(user.promptpayId && user.promptpayId.length > 0);
  // With auto-confirm on there's nothing to wait for — hide the pending card
  // unless some older tips are still pending.
  const showPending = !user.autoConfirmTips || pendingCount > 0;
  const profilePath = `/${locale}/${user.username}`;

  // Convert Prisma Decimal -> number BEFORE passing to the client component.
  const clientTips = tips.map((tip) => ({
    id: tip.id,
    supporterName: tip.supporterName,
    message: tip.message,
    amount: Number(tip.amount),
    status: tip.status,
    slipUrl: tip.slipUrl,
    autoVerified: tip.autoVerified,
    verifyCode: tip.verifyCode,
    verifyDetail: tip.verifyDetail,
    createdAt: tip.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-8">
      {/* Keep the tip list fresh without a manual reload. */}
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-brand-900">
          {t("welcome", { name: user.displayName })}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${locale}/start`}
            className="rounded-full border border-brand-300 bg-brand-50/70 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-100"
          >
            📖 {tCommon("guide")}
          </Link>
          {SHOP_ENABLED && (
            <Link
              href={`/${locale}/dashboard/shop`}
              className="rounded-full border border-brand-300 bg-brand-50/70 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-100"
            >
              🛒 {tShop("dashboardTitle")}
            </Link>
          )}
          <Link
            href={`/${locale}/dashboard/settings`}
            className="rounded-full border border-brand-300 bg-brand-50/70 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-100"
          >
            ⚙️ {t("goSettings")}
          </Link>
        </div>
      </div>

      {!hasPromptpay && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          {t("setupPromptpayWarning")}{" "}
          <Link href={`/${locale}/dashboard/settings`} className="font-semibold underline">
            {t("goSettings")}
          </Link>
        </div>
      )}

      {/* Profile link */}
      <div className="card rounded-2xl p-5">
        <p className="text-sm font-medium text-brand-900/70">{t("yourLink")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm text-brand-800">
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
      </div>

      {/* OBS donation alert */}
      <OverlaySettings />

      {/* Stats */}
      <div
        className={`grid gap-4 ${showPending ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      >
        <Stat label={t("totalReceived")} value={formatBaht(totalConfirmed, currencyLocale)} highlight />
        {showPending && (
          <Stat label={t("pendingCount")} value={String(pendingCount)} />
        )}
        <Stat label={t("tipsCount")} value={String(tips.length)} />
      </div>

      {/* Tips */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-brand-900">{t("tipsTitle")}</h2>
          {rejectedCount > 0 && <ClearRejectedButton count={rejectedCount} />}
        </div>
        {clientTips.length === 0 ? (
          <p className="card rounded-2xl p-6 text-center text-brand-900/60">
            {t("noTips")}
          </p>
        ) : (
          <ul className="space-y-3">
            {clientTips.map((tip) => (
              <TipRow key={tip.id} tip={tip} locale={locale} />
            ))}
          </ul>
        )}
      </div>

      {/* Report / contact admin */}
      <ReportForm />
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="card rounded-2xl p-5">
      <p className="text-sm font-medium text-brand-900/60">{label}</p>
      <p
        className={`mt-1 text-2xl font-extrabold ${
          highlight ? "text-brand-600" : "text-brand-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
