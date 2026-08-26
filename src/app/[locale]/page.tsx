import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReviewsSection } from "@/components/ReviewsSection";
import { Icon, type IconName } from "@/components/Icon";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    alternates: {
      canonical: `/${locale}`,
      languages: { th: "/th", en: "/en", "x-default": "/th" },
    },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");

  // Structured data so Google understands the site.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TipTang",
    url: "https://tiptang.com",
    inLanguage: locale,
    description:
      "รับทิป/โดเนทผ่าน PromptPay ฟรี ไม่มีค่าธรรมเนียม ทางเลือกแทน TipMe สำหรับครีเอเตอร์และสตรีมเมอร์ไทย",
  };

  // Check the session (for login-aware hero CTAs) alongside the reviews in a
  // single parallel round trip.
  const [session, approved] = await Promise.all([
    auth(),
    prisma.review.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, name: true, rating: true, comment: true },
    }),
  ]);
  const loggedIn = Boolean(session?.user);
  const reviewCount = approved.length;
  const avgRating =
    reviewCount > 0
      ? approved.reduce((s, r) => s + r.rating, 0) / reviewCount
      : 0;

  const steps: { title: string; desc: string; icon: IconName }[] = [
    { title: t("step1Title"), desc: t("step1Desc"), icon: "palette" },
    { title: t("step2Title"), desc: t("step2Desc"), icon: "link" },
    { title: t("step3Title"), desc: t("step3Desc"), icon: "heart" },
  ];
  const features = [t("feature1"), t("feature2"), t("feature3")];

  return (
    <div className="space-y-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero */}
      <section className="pt-8 text-center sm:pt-14">
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-brand-900 sm:text-5xl">
          {t("heroTitle")}
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-brand-900/70">
          {t("heroSubtitle")}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {loggedIn ? (
            // Already signed in — skip register/login, go straight to the dashboard.
            <Link
              href="/dashboard"
              className="rounded-full bg-brand-600 px-7 py-3 text-base font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700"
            >
              {t("ctaDashboard")}
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="rounded-full bg-brand-600 px-7 py-3 text-base font-semibold text-white shadow-lg shadow-brand-600/30 transition hover:bg-brand-700"
              >
                {t("ctaPrimary")}
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-brand-300 bg-brand-50/70 px-7 py-3 text-base font-semibold text-brand-800 transition hover:bg-brand-100"
              >
                {t("ctaSecondary")}
              </Link>
            </>
          )}
        </div>
        {!loggedIn && (
          <p className="mt-3 text-sm text-brand-900/50">{t("ctaMicro")}</p>
        )}
      </section>

      {/* How it works */}
      <section>
        <h2 className="mb-6 text-center text-2xl font-bold text-brand-900">
          {t("howItWorks")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.title} className="card rounded-2xl p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
                <Icon name={s.icon} className="h-6 w-6" />
              </div>
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
              <Icon name="check" className="mt-0.5 h-5 w-5 text-brand-600" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Comparison — our real edge vs typical platforms */}
      <section>
        <h2 className="mb-6 text-center text-2xl font-bold text-brand-900">
          {t("compareTitle")}
        </h2>
        <div className="overflow-hidden rounded-3xl border border-brand-200">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] bg-brand-50 text-sm font-bold text-brand-900">
            <div className="p-3 sm:p-4" />
            <div className="p-3 text-center sm:p-4">{t("compareUsHead")}</div>
            <div className="p-3 text-center text-brand-900/55 sm:p-4">
              {t("compareOthersHead")}
            </div>
          </div>
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="grid grid-cols-[1.4fr_1fr_1fr] border-t border-brand-100 text-sm"
            >
              <div className="p-3 font-medium text-brand-900/80 sm:p-4">
                {t(`compareRow${n}Label`)}
              </div>
              <div className="flex items-center justify-center gap-1 p-3 text-center font-semibold text-brand-700 sm:p-4">
                <Icon name="check" className="text-brand-600" />
                {t(`compareRow${n}Us`)}
              </div>
              <div className="p-3 text-center text-brand-900/55 sm:p-4">
                {t(`compareRow${n}Others`)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-brand-900/50">
          {t("compareNote")}
        </p>
      </section>

      {/* FAQ — answer the "is it really free?" skepticism head-on */}
      <section>
        <h2 className="mb-6 text-center text-2xl font-bold text-brand-900">
          {t("faqTitle")}
        </h2>
        <div className="mx-auto max-w-2xl space-y-3">
          {[1, 2, 3].map((n) => (
            <details key={n} className="card group rounded-2xl p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-brand-900 [&::-webkit-details-marker]:hidden">
                <span>{t(`faqQ${n}`)}</span>
                <span
                  className="shrink-0 text-xl leading-none text-brand-500 transition-transform group-open:rotate-45"
                  aria-hidden
                >
                  ＋
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-brand-900/70">
                {t(`faqA${n}`)}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Reviews / social proof */}
      <ReviewsSection
        reviews={approved}
        average={avgRating}
        count={reviewCount}
      />
    </div>
  );
}
