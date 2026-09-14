import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/Icon";

type Step = { done: boolean; label: string } & (
  | { href: string; cta: string }
  | { hint: string }
);

/**
 * Three setup steps a new creator has to get through before TipTang does
 * anything for them. Every step is detected from data the page already
 * has — nothing to tick, and the whole block disappears once all three
 * are true, so established creators never see it.
 */
export async function OnboardingChecklist({
  locale,
  promptpayDone,
  overlayDone,
  firstTipDone,
}: {
  locale: string;
  promptpayDone: boolean;
  overlayDone: boolean;
  firstTipDone: boolean;
}) {
  if (promptpayDone && overlayDone && firstTipDone) return null;
  const t = await getTranslations("dashboard");

  const steps: Step[] = [
    {
      done: promptpayDone,
      label: t("onboardingPromptpay"),
      href: `/${locale}/dashboard/settings`,
      cta: t("goSettings"),
    },
    {
      done: overlayDone,
      label: t("onboardingOverlay"),
      href: `/${locale}/dashboard/overlay`,
      cta: t("goOverlay"),
    },
    {
      done: firstTipDone,
      label: t("onboardingFirstTip"),
      hint: t("onboardingFirstTipHint"),
    },
  ];

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
        <Icon name="sparkles" />
        {t("onboardingTitle")}
      </h2>
      <ol className="divide-y divide-brand-900/10">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-3 py-2.5">
            {step.done ? (
              <Icon name="check-circle" className="h-5 w-5 text-emerald-600" />
            ) : (
              <span
                className="h-5 w-5 shrink-0 rounded-full border-2 border-brand-300"
                aria-hidden
              />
            )}
            <span
              className={`min-w-0 flex-1 ${
                step.done ? "text-brand-900/50" : "font-medium text-brand-900"
              }`}
            >
              {step.label}
            </span>
            {!step.done &&
              ("href" in step ? (
                <Link
                  href={step.href}
                  className="shrink-0 text-sm font-semibold text-brand-700 hover:underline"
                >
                  {step.cta} →
                </Link>
              ) : (
                <span className="shrink-0 text-sm text-brand-900/60">
                  {step.hint}
                </span>
              ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
