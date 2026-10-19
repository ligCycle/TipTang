import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { SLIP_KEEP_DAYS, slipDeleteDate } from "@/lib/retention";
import { TipRow } from "@/components/TipRow";
import { ClearRejectedButton } from "@/components/ClearRejectedButton";
import { Icon } from "@/components/Icon";

const FULL_LIST = 100;

export const TIP_FILTERS = ["all", "PENDING", "CONFIRMED", "REJECTED"] as const;
export type TipFilter = (typeof TIP_FILTERS)[number];
const FILTER_LABEL: Record<TipFilter, string> = {
  all: "filterAll",
  PENDING: "filterPending",
  CONFIRMED: "filterConfirmed",
  REJECTED: "filterRejected",
};

/**
 * The creator's tips, newest first, with confirm/reject on each row. The
 * dashboard home shows the latest few (`limit`) with a link to the full list
 * on /dashboard/tips, which can also filter by status (?status=).
 */
export async function TipList({
  userId,
  locale,
  limit,
  filter,
}: {
  userId: string;
  locale: string;
  limit?: number;
  /** Full list only: show tabs and keep tips of this status. */
  filter?: TipFilter;
}) {
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("dashNav");
  const now = new Date();

  const tips = await prisma.tip.findMany({
    where: { creatorId: userId, ...(filter && filter !== "all" ? { status: filter } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit ?? FULL_LIST,
    select: {
      id: true,
      supporterName: true,
      message: true,
      amount: true,
      status: true,
      slipUrl: true,
      slipKey: true,
      slipPurgedAt: true,
      autoVerified: true,
      verifyCode: true,
      verifyDetail: true,
      timerEffect: true,
      paymentMethod: true,
      createdAt: true,
      pickedSound: { select: { name: true } },
    },
  });
  // The "clear rejected" action counts the creator's rejected tips overall,
  // not just the few shown on the home page.
  const byStatus = await prisma.tip.groupBy({
    by: ["status"],
    where: { creatorId: userId },
    _count: { _all: true },
  });
  const countOf = (st: string) => byStatus.find((g) => g.status === st)?._count._all ?? 0;
  const rejectedCount = countOf("REJECTED");
  const counts: Record<TipFilter, number> = {
    all: byStatus.reduce((n, g) => n + g._count._all, 0),
    PENDING: countOf("PENDING"),
    CONFIRMED: countOf("CONFIRMED"),
    REJECTED: rejectedCount,
  };

  // When the retention job will delete a decided tip's slip, and whether that
  // is within a week (highlighted). Worked out here, not in the client row,
  // so server and browser render the same thing. Pending tips get no date:
  // confirming or rejecting one moves it.
  const slipDeletion = (tip: (typeof tips)[number]) => {
    if (tip.status === "PENDING" || !(tip.slipKey || tip.slipUrl)) {
      return { slipDeleteAt: null, slipDeleteSoon: false };
    }
    const at = slipDeleteDate(tip.createdAt, true);
    return {
      slipDeleteAt: at.toISOString(),
      slipDeleteSoon: at.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000,
    };
  };

  // Convert Prisma Decimal -> number BEFORE passing to the client component.
  const clientTips = tips.map((tip) => ({
    id: tip.id,
    supporterName: tip.supporterName,
    message: tip.message,
    amount: Number(tip.amount),
    status: tip.status,
    // Every slip goes through the owner-checked route, legacy public URLs
    // included — so a leaked dashboard link never exposes the raw file.
    slipUrl: tip.slipKey || tip.slipUrl ? `/api/tips/${tip.id}/slip` : null,
    slipPurged: Boolean(tip.slipPurgedAt),
    ...slipDeletion(tip),
    autoVerified: tip.autoVerified,
    verifyCode: tip.verifyCode,
    verifyDetail: tip.verifyDetail,
    timerEffect: tip.timerEffect,
    paymentMethod: tip.paymentMethod,
    createdAt: tip.createdAt.toISOString(),
    // The fan's picked sound: its name, "" if unnamed, null if none.
    pickedSound: tip.pickedSound ? (tip.pickedSound.name ?? "") : null,
  }));

  return (
    <div id="tips">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {/* Its own page gets the page heading; on the home page it's a section. */}
        {filter ? (
          <h1 className="text-2xl font-extrabold text-brand-900">{t("tipsTitle")}</h1>
        ) : (
          <h2 className="text-lg font-bold text-brand-900">{t("tipsTitle")}</h2>
        )}
        {rejectedCount > 0 && <ClearRejectedButton count={rejectedCount} />}
      </div>
      {filter && (
        <nav aria-label={t("tipsTitle")} className="mb-4 flex flex-wrap gap-1.5">
          {TIP_FILTERS.map((f) => {
            const active = f === filter;
            return (
              <Link
                key={f}
                href={f === "all" ? `/${locale}/dashboard/tips` : `/${locale}/dashboard/tips?status=${f}`}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  active ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-800 hover:bg-brand-200"
                }`}
              >
                {t(FILTER_LABEL[f])}
                <span
                  className={`rounded-full px-1.5 text-xs tabular-nums ${
                    active ? "bg-white/25" : f === "PENDING" && counts.PENDING > 0 ? "bg-amber-200 text-amber-900" : "bg-white/60"
                  }`}
                >
                  {counts[f]}
                </span>
              </Link>
            );
          })}
        </nav>
      )}
      {clientTips.length > 0 && (
        <p className="-mt-2 mb-4 flex items-start gap-1.5 text-sm text-brand-900/60">
          <Icon name="clock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("slipRetentionHint", { days: SLIP_KEEP_DAYS })}</span>
        </p>
      )}
      {clientTips.length === 0 ? (
        <p className="card rounded-2xl p-6 text-center text-brand-900/60">
          {filter && filter !== "all" && counts.all > 0 ? t("noTipsInFilter") : t("noTips")}
        </p>
      ) : (
        <ul className="space-y-3">
          {clientTips.map((tip) => (
            <TipRow key={tip.id} tip={tip} locale={locale} />
          ))}
        </ul>
      )}
      {limit != null && clientTips.length >= limit && (
        <p className="mt-4 text-center">
          <Link
            href={`/${locale}/dashboard/tips`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            {tNav("seeAllTips")}
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </p>
      )}
    </div>
  );
}
