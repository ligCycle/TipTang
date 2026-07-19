import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");

  const steps = [
    { title: t("step1Title"), desc: t("step1Desc"), icon: "🎨" },
    { title: t("step2Title"), desc: t("step2Desc"), icon: "🔗" },
    { title: t("step3Title"), desc: t("step3Desc"), icon: "💝" },
  ];
  const features = [t("feature1"), t("feature2"), t("feature3")];

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="pt-8 text-center sm:pt-14">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-brand-900 sm:text-5xl">
          {t("heroTitle")}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-brand-900/70">
          {t("heroSubtitle")}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/register"
            className="rounded-full bg-brand-600 px-7 py-3 text-base font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700"
          >
            {t("ctaPrimary")}
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-brand-300 bg-white/70 px-7 py-3 text-base font-semibold text-brand-800 transition hover:bg-brand-100"
          >
            {t("ctaSecondary")}
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section>
        <h2 className="mb-6 text-center text-2xl font-bold text-brand-900">
          {t("howItWorks")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="card rounded-2xl p-6 text-center">
              <div className="text-4xl">{s.icon}</div>
              <h3 className="mt-3 font-bold text-brand-800">{s.title}</h3>
              <p className="mt-1.5 text-sm text-brand-900/65">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="card rounded-3xl p-8">
        <h2 className="mb-5 text-center text-2xl font-bold text-brand-900">
          {t("featuresTitle")}
        </h2>
        <ul className="mx-auto max-w-lg space-y-3">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-3 text-brand-900/80">
              <span className="mt-0.5 text-brand-600">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
