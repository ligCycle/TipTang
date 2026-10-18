import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { SLIP_KEEP_DAYS, slipDeleteDate } from "@/lib/retention";
import { TipRow } from "@/components/TipRow";
import { ClearRejectedButton } from "@/components/ClearRejectedButton";
import { Icon } from "@/components/Icon";

const FULL_LIST = 100;

/**
 * The creator's tips, newest first, with confirm/reject on each row. The
 * dashboard home shows the latest few (`limit`) with a link to the full list
 * on /dashboard/tips.
 */
export async function TipList({
  userId,
  locale,
  limit,
}: {
  userId: string;
  locale: string;
  limit?: number;
}) {
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("dashNav");
  const now = new Date();

  const tips = await prisma.tip.findMany({
    where: { creatorId: userId },
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
    },
  });
  // The "clear rejected" action counts the creator's rejected tips overall,
  // not just the few shown on the home page.
  const rejectedCount = await prisma.tip.count({
    where: { creatorId: userId, status: "REJECTED" },
  });

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
  }));

  return (
    <div id="tips">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-brand-900">{t("tipsTitle")}</h2>
        {rejectedCount > 0 && <ClearRejectedButton count={rejectedCount} />}
      </div>
      {clientTips.length > 0 && (
        <p className="-mt-2 mb-4 flex items-start gap-1.5 text-sm text-brand-900/60">
          <Icon name="clock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("slipRetentionHint", { days: SLIP_KEEP_DAYS })}</span>
        </p>
      )}
      {clientTips.length === 0 ? (
        <p className="card rounded-2xl p-6 text-center text-brand-900/60">{t("noTips")}</p>
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
