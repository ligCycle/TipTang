import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { Reveal } from "@/components/Reveal";
import { Icon, type IconName } from "@/components/Icon";

// Rendered per request (not prerendered) so the buttons can follow the
// visitor's login state: a creator who opens the guide from the dashboard
// menu should never be told to "sign up".

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
  const [t, session] = await Promise.all([getTranslations("guide"), auth()]);
  const loggedIn = Boolean(session?.user);

  const obsSteps = [
    t("obsStep1"),
    t("obsStep2"),
    t("obsStep3"),
    t("obsStep4"),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-12">
      {/* In-app-browser (LINE/Messenger) hint — a warning, so it keeps its amber */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        <Icon name="lightbulb" className="mt-0.5" />
        <span>{t("browserHint")}</span>
      </div>

      <header>
        <h1 className="text-4xl font-extrabold tracking-tight text-brand-900">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-brand-900/70">{t("intro")}</p>
      </header>

      {/* 5 steps — numbered rows, no boxes */}
      <ol className="divide-y divide-brand-900/10">
        <Step n={1} icon="user" title={t("step1Title")} desc={t("step1Desc")}>
          {loggedIn ? (
            <DoneBadge label={t("doneBadge")} />
          ) : (
            <StepButton href="/register" label={t("step1Cta")} />
          )}
        </Step>

        <Step n={2} icon="credit-card" title={t("step2Title")} desc={t("step2Desc")}>
          {loggedIn && (
            <StepButton href="/dashboard/settings" label={t("step2Cta")} />
          )}
        </Step>

        <Step n={3} icon="monitor" title={t("step3Title")} desc={t("step3Desc")}>
          <div className="mt-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900/75">
            <p className="flex items-start gap-2">
              <Icon name="lightbulb" className="mt-0.5 shrink-0 text-brand-600" />
              <span>{t("obsLeadIn")}</span>
            </p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-7">
              {obsSteps.map((s, i) => (
                <li key={i} className="break-words">
                  {s}
                </li>
              ))}
            </ol>
          </div>
          {loggedIn && (
            <StepButton href="/dashboard/overlay" label={t("step3Cta")} />
          )}
        </Step>

        <Step n={4} icon="link" title={t("step4Title")} desc={t("step4Desc")} />

        <Step n={5} icon="check-circle" title={t("step5Title")} desc={t("step5Desc")} />
      </ol>

      {/* Why TipTang — one ink card */}
      <Reveal>
        <section className="ink rounded-3xl p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold tracking-tight">{t("whyTitle")}</h2>
          <ul className="mt-4 space-y-3">
            {[t("why1"), t("why2"), t("why3")].map((why) => (
              <li key={why} className="flex items-start gap-3 text-white/80">
                <Icon name="check-circle" className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
                <span>{why}</span>
              </li>
            ))}
          </ul>
        </section>
      </Reveal>

      {/* CTA */}
      <Reveal>
        <div className="flex justify-center">
          <Link
            href={loggedIn ? "/dashboard" : "/register"}
            className="pill pill-brand"
          >
            {loggedIn ? t("ctaDashboard") : t("ctaLabel")}
            <span className="pill-arrow">
              <Icon name="arrow-right" />
            </span>
          </Link>
        </div>
      </Reveal>
    </div>
  );
}

function Step({
  n,
  icon,
  title,
  desc,
  children,
}: {
  n: number;
  icon: IconName;
  title: string;
  desc: string;
  children?: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[3rem_1fr] gap-4 py-7 first:pt-0">
      <span
        aria-hidden
        className="pt-0.5 text-3xl font-black tabular-nums leading-none text-brand-900/15"
      >
        0{n}
      </span>
      <div className="min-w-0">
        <h2 className="flex items-center gap-3 text-xl font-bold text-brand-900">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
            <Icon name={icon} className="h-4 w-4" />
          </span>
          {title}
        </h2>
        <p className="mt-2 break-words text-brand-900/70">{desc}</p>
        {children}
      </div>
    </li>
  );
}

function StepButton({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="pill pill-outline pill-plain mt-4 text-sm">
      {label}
    </Link>
  );
}

function DoneBadge({ label }: { label: string }) {
  return (
    <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
      <Icon name="check-circle" className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
