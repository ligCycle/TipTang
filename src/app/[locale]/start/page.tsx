import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// Static content page → pre-render one HTML per locale (fast + good CWV).
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "guide" });
  return {
    title: t("title"),
    description: t("intro"),
    alternates: {
      canonical: `/${locale}/start`,
      languages: { th: "/th/start", en: "/en/start", "x-default": "/th/start" },
    },
  };
}

export default async function StartPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("guide");

  const obsSteps = [
    t("obsStep1"),
    t("obsStep2"),
    t("obsStep3"),
    t("obsStep4"),
  ];

  return (
    <div className="space-y-8">
      {/* In-app-browser (LINE/Messenger) hint */}
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {t("browserHint")}
      </div>

      <header className="text-center">
        <h1 className="text-3xl font-extrabold text-brand-900">{t("title")}</h1>
        <p className="mx-auto mt-2 max-w-2xl text-brand-900/70">{t("intro")}</p>
      </header>

      {/* 5 steps — one column on mobile */}
      <ol className="space-y-4">
        <Step icon="🎨" n={1} title={t("step1Title")} desc={t("step1Desc")}>
          <StepButton href="/register" label={t("step1Cta")} />
        </Step>

        <Step icon="💳" n={2} title={t("step2Title")} desc={t("step2Desc")}>
          <StepButton href="/dashboard/settings" label={t("step2Cta")} />
          <p className="mt-1.5 text-xs text-brand-900/45">{t("step2Hint")}</p>
        </Step>

        <Step icon="🔗" n={3} title={t("step3Title")} desc={t("step3Desc")} />

        <Step icon="📺" n={4} title={t("step4Title")} desc={t("step4Desc")}>
          <p className="mt-2 rounded-lg bg-brand-100/60 px-3 py-2 text-xs text-brand-900/70">
            💡 {t("obsLeadIn")}
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-brand-900/70">
            {obsSteps.map((s, i) => (
              <li key={i} className="break-words">
                {s}
              </li>
            ))}
          </ol>
        </Step>

        <Step icon="🎉" n={5} title={t("step5Title")} desc={t("step5Desc")} />
      </ol>

      {/* Why TipTang */}
      <div className="card rounded-2xl p-5">
        <h2 className="font-bold text-brand-900">{t("whyTitle")}</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-brand-900/75">
          <li>✅ {t("why1")}</li>
          <li>✅ {t("why2")}</li>
          <li>✅ {t("why3")}</li>
        </ul>
      </div>

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/register"
          className="inline-block w-full rounded-full bg-brand-600 px-8 py-3 font-semibold text-white shadow-sm hover:bg-brand-700 sm:w-auto"
        >
          {t("ctaLabel")}
        </Link>
      </div>
    </div>
  );
}

function Step({
  icon,
  n,
  title,
  desc,
  children,
}: {
  icon: string;
  n: number;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="card rounded-2xl p-5">
      <div className="flex items-start gap-4">
        <span className="shrink-0 text-3xl" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-brand-900">
            {n}. {title}
          </h2>
          <p className="mt-1 break-words text-sm text-brand-900/70">{desc}</p>
          {children}
        </div>
      </div>
    </li>
  );
}

function StepButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-3 inline-block w-full rounded-full bg-brand-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700 sm:w-auto"
    >
      {label}
    </Link>
  );
}
