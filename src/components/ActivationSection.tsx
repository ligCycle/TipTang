import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import {
  stage,
  nudgeTemplate,
  compareRows,
  STAGE_ORDER,
  type Stage,
} from "@/lib/activation";
import { formatBaht, formatDate, relativeTime } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { NudgeButton } from "@/components/NudgeButton";

const BADGE: Record<Stage, string> = {
  NO_PROMPTPAY: "bg-brand-100 text-brand-900/60",
  NO_OVERLAY: "bg-yellow-100 text-yellow-800",
  NO_TIP: "bg-orange-100 text-orange-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  IDLE: "bg-red-100 text-red-700",
};

/**
 * Server component: the activation funnel + one row per creator, sorted so
 * the people worth talking to are at the top. All times are formatted here
 * against a single `now`, so nothing drifts on hydration.
 */
export async function ActivationSection({ locale }: { locale: string }) {
  const t = await getTranslations("admin.activation");
  const lang: "th" | "en" = locale === "th" ? "th" : "en";
  const dateLocale = lang === "th" ? "th-TH" : "en-US";
  const now = new Date();

  const [users, tipAgg] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        createdAt: true,
        promptpayId: true,
        overlayLastSeenAt: true,
        activationNudgeSentAt: true,
      },
    }),
    // One query for every creator's confirmed-tip count / sum / latest.
    prisma.tip.groupBy({
      by: ["creatorId"],
      where: { status: "CONFIRMED" },
      _count: { _all: true },
      _sum: { amount: true },
      _max: { confirmedAt: true },
    }),
  ]);
  const agg = new Map(tipAgg.map((a) => [a.creatorId, a]));

  const rows = users
    .map((u) => {
      const a = agg.get(u.id);
      const lastConfirmedTipAt = a?._max.confirmedAt ?? null;
      const input = {
        promptpayId: u.promptpayId,
        overlayLastSeenAt: u.overlayLastSeenAt,
        lastConfirmedTipAt,
      };
      return {
        ...u,
        ...input,
        stage: stage(input, now),
        tipCount: a?._count._all ?? 0,
        tipSum: Number(a?._sum.amount ?? 0),
        isAdmin: isAdminEmail(u.email),
      };
    })
    .sort(compareRows);

  const counted = rows.filter((r) => !r.isAdmin);
  const funnel = STAGE_ORDER.map((s) => ({
    stage: s,
    n: counted.filter((r) => r.stage === s).length,
  }));

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-brand-900">
        <Icon name="zap" className="h-5 w-5" />
        {t("title")}
      </h2>
      <p className="mb-4 text-xs text-brand-900/55">{t("hint")}</p>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {funnel.map((f) => (
          <div key={f.stage} className="card rounded-2xl px-3 py-2">
            <p className="text-2xl font-extrabold tabular-nums text-brand-900">{f.n}</p>
            <p className="text-xs text-brand-900/60">{t(`stage_${f.stage}`)}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[840px] text-sm">
          <thead className="text-left text-xs text-brand-900/55">
            <tr>
              <th className="px-3 py-2">{t("colCreator")}</th>
              <th className="px-3 py-2">{t("colSignup")}</th>
              <th className="px-3 py-2">{t("colPromptpay")}</th>
              <th className="px-3 py-2">{t("colOverlay")}</th>
              <th className="px-3 py-2">{t("colTips")}</th>
              <th className="px-3 py-2">{t("colLastTip")}</th>
              <th className="px-3 py-2">{t("colStage")}</th>
              <th className="px-3 py-2">{t("colNudge")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const overlayLabel = r.overlayLastSeenAt
                ? relativeTime(r.overlayLastSeenAt, now, lang)
                : r.tipCount > 0
                  ? t("noData")
                  : t("never");
              const sentLabel = r.activationNudgeSentAt
                ? t("sentOn", { date: formatDate(r.activationNudgeSentAt, dateLocale) })
                : null;
              const template = nudgeTemplate(r.stage);
              return (
                <tr key={r.id} className="border-t border-brand-900/10 align-top">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-brand-900">{r.displayName}</div>
                    <a
                      href={`/${locale}/${r.username}`}
                      className="text-xs text-brand-700 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      @{r.username}
                    </a>
                    <div className="text-xs text-brand-900/50">{r.email}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {relativeTime(r.createdAt, now, lang)}
                  </td>
                  <td className="px-3 py-2">{r.promptpayId ? "✓" : "✗"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{overlayLabel}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.tipCount}
                    {r.tipCount > 0 && (
                      <span className="text-brand-900/50">
                        {" "}
                        ({formatBaht(r.tipSum, dateLocale)})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.lastConfirmedTipAt
                      ? relativeTime(r.lastConfirmedTipAt, now, lang)
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[r.stage]}`}
                    >
                      {t(`stage_${r.stage}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.isAdmin ? (
                      <span className="inline-flex flex-wrap gap-1">
                        <NudgeButton
                          userId={r.id}
                          sentLabel={null}
                          mode="test"
                          template="NO_PROMPTPAY"
                        />
                        <NudgeButton
                          userId={r.id}
                          sentLabel={null}
                          mode="test"
                          template="NO_OVERLAY"
                        />
                      </span>
                    ) : template ? (
                      <NudgeButton userId={r.id} sentLabel={sentLabel} mode="send" />
                    ) : (
                      <span className="text-brand-900/40">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
