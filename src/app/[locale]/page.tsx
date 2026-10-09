import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReviewsSection } from "@/components/ReviewsSection";
import { Reveal } from "@/components/Reveal";
import { HeroMock } from "@/components/HeroMock";
import { Icon } from "@/components/Icon";

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

const h2Class =
  "text-3xl font-extrabold tracking-tight text-brand-900 sm:text-4xl";

function Pill({
  href,
  variant,
  children,
  arrow = true,
}: {
  href: string;
  variant: "brand" | "outline";
  children: string;
  arrow?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`pill pill-${variant} ${arrow ? "" : "pill-plain"}`}
    >
      {children}
      {arrow && (
        <span className="pill-arrow">
          <Icon name="arrow-right" />
        </span>
      )}
    </Link>
  );
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
      "รับทิป/โดเนทผ่าน PromptPay ฟรี ไม่มีค่าธรรมเนียม สำหรับครีเอเตอร์และสตรีมเมอร์ไทย",
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

  const steps = [
    { title: t("step1Title"), desc: t("step1Desc") },
    { title: t("step2Title"), desc: t("step2Desc") },
    { title: t("step3Title"), desc: t("step3Desc") },
  ];
  const features = [t("feature1"), t("feature2"), t("feature3")];
  const heroLines = [t("heroLine1"), t("heroLine2"), t("heroLine3")];
  const micro = t("ctaMicro").split(" • ");

  // The primary call to action is the same everywhere on the page.
  const primaryCta = loggedIn ? (
    <Pill href="/dashboard" variant="brand">
      {t("ctaDashboard")}
    </Pill>
  ) : (
    <Pill href="/register" variant="brand">
      {t("ctaPrimary")}
    </Pill>
  );

  return (
    <div className="space-y-20 sm:space-y-28">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden pt-6 sm:pt-12">
        <div className="relative grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-brand-900/70">
              <span
                className="h-1.5 w-1.5 rounded-full bg-brand-500"
                aria-hidden
              />
              {t("heroEyebrow")}
            </p>
            {/* Each line is clipped and rises on load; delay is per line
                inline so the CSS never depends on how many lines there are.
                The lines are explicit, so no max-width: the column bounds
                them. Sizes keep the longest line on one row in LINE Seed
                (wider than the old system font): 9vw on small phones,
                3.5rem in the lg column. */}
            <h1 className="rise mt-4 text-[clamp(1.75rem,9vw,2.25rem)] font-extrabold leading-[1.05] tracking-tight text-brand-900 sm:text-5xl lg:text-[3.5rem]">
              {heroLines.map((line, i) => (
                <span key={line}>
                  <span
                    style={{ animationDelay: `${i * 120}ms` }}
                    className={
                      i === heroLines.length - 1 ? "text-brand-600" : ""
                    }
                  >
                    {line}
                  </span>
                </span>
              ))}
            </h1>
            <p className="mt-6 max-w-xl text-lg text-brand-900/70">
              {t("heroSubtitle")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {primaryCta}
              {!loggedIn && (
                <Pill href="/login" variant="outline" arrow={false}>
                  {t("ctaSecondary")}
                </Pill>
              )}
            </div>
            {reviewCount > 0 && (
              <p className="mt-6 flex items-center gap-3 text-sm font-medium text-brand-900/70">
                <span className="tracking-tight text-brand-500" aria-hidden>
                  ★★★★★
                </span>
                {t("heroRating", {
                  avg: avgRating.toFixed(1),
                  count: reviewCount,
                })}
              </p>
            )}
          </div>
          {/* lg:pr-10 leaves room for the badge that overhangs the card
              (sm:-right-6), so the section's overflow-hidden never clips it. */}
          <div className="flex justify-center lg:col-span-5 lg:justify-end lg:pr-10">
            <Reveal delay={200} className="w-full max-w-sm">
              <HeroMock />
            </Reveal>
          </div>
        </div>

        {/* Status bar: the three micro-promises, no new copy */}
        <div className="relative mt-14 flex items-center justify-between gap-3 border-t border-brand-900/10 py-4 text-xs font-semibold text-brand-900/60">
          <span>{micro[0]}</span>
          <span className="hidden sm:inline">{micro[1]}</span>
          <span>{micro[2]}</span>
        </div>
      </section>

      {/* ===== How it works — one rail, three stops =====
          The steps really are in order, so they keep their numbers; no
          boxes or icon tiles. Vertical rail on phones, horizontal from sm. */}
      <section>
        <h2 className={h2Class}>{t("howItWorks")}</h2>
        <ol className="mt-8 grid gap-8 border-l border-brand-900/15 pl-6 sm:grid-cols-3 sm:gap-6 sm:border-l-0 sm:border-t sm:pl-0 sm:pt-6">
          {steps.map((s, i) => (
            <li key={s.title} className="relative">
              <span
                aria-hidden
                className="absolute -left-[1.85rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-600 sm:-top-[1.85rem] sm:left-0"
              />
              <h3 className="flex items-baseline gap-3 text-xl font-bold text-brand-900">
                <span className="text-sm font-bold tabular-nums text-brand-600">
                  0{i + 1}
                </span>
                {s.title.replace(/^\d+\.\s*/, "")}
              </h3>
              <p className="mt-2 max-w-xs text-sm text-brand-900/70">{s.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ===== Why TipTang — plain rows, no box ===== */}
      <section className="grid gap-8 lg:grid-cols-[1fr_2fr]">
        <h2 className={h2Class}>{t("featuresTitle")}</h2>
        <ul className="divide-y divide-brand-900/10">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-3 py-5">
              <Icon
                name="check-circle"
                className="mt-1 h-5 w-5 shrink-0 text-brand-600"
              />
              <p className="flex-1 text-lg font-semibold text-brand-900">{f}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ===== Comparison — same data, ink header, highlighted column ===== */}
      <section>
        <h2 className={h2Class}>{t("compareTitle")}</h2>
        <div className="mt-8 overflow-hidden rounded-3xl border border-brand-900/10">
          <div className="ink grid grid-cols-[1.4fr_1fr_1fr] text-sm font-bold">
            <div className="p-3 sm:p-4" />
            <div className="p-3 text-center sm:p-4">{t("compareUsHead")}</div>
            <div className="p-3 text-center text-white/55 sm:p-4">
              {t("compareOthersHead")}
            </div>
          </div>
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="grid grid-cols-[1.4fr_1fr_1fr] border-t border-brand-900/10 text-sm"
            >
              <div className="p-3 font-medium text-brand-900/80 sm:p-4">
                {t(`compareRow${n}Label`)}
              </div>
              <div className="flex items-center justify-center gap-1 bg-brand-50 p-3 text-center font-bold text-brand-700 sm:p-4">
                <Icon name="check" className="shrink-0 text-brand-600" />
                {t(`compareRow${n}Us`)}
              </div>
              <div className="p-3 text-center text-brand-900/55 sm:p-4">
                {t(`compareRow${n}Others`)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-brand-900/50">{t("compareNote")}</p>
      </section>

      {/* ===== FAQ — hairline rows ===== */}
      <section>
        <h2 className={h2Class}>{t("faqTitle")}</h2>
        <div className="mt-6 max-w-2xl divide-y divide-brand-900/10">
          {[1, 2, 3, 4].map((n) => (
            <details key={n} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-lg font-semibold text-brand-900 [&::-webkit-details-marker]:hidden">
                <span>{t(`faqQ${n}`)}</span>
                <Icon
                  name="chevron-down"
                  className="h-5 w-5 shrink-0 text-brand-500 transition-transform group-open:rotate-180"
                />
              </summary>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-brand-900/70">
                {t(`faqA${n}`)}
              </p>
            </details>
          ))}
        </div>
      </section>

      <ReviewsSection
        reviews={approved}
        average={avgRating}
        count={reviewCount}
      />

      {/* ===== Closing CTA band ===== */}
      <section className="ink rounded-3xl p-8 sm:p-12">
        <div className="max-w-xl">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            {t("ctaBandTitle")}
          </h2>
          <p className="mt-3 text-white/60">{t("ctaBandDesc")}</p>
          <div className="mt-8">
            <Pill href={loggedIn ? "/dashboard" : "/register"} variant="brand">
              {loggedIn ? t("ctaDashboard") : t("ctaPrimary")}
            </Pill>
          </div>
        </div>
      </section>
    </div>
  );
}
