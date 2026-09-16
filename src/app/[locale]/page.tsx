import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReviewsSection } from "@/components/ReviewsSection";
import { Reveal } from "@/components/Reveal";
import { HeroMock } from "@/components/HeroMock";
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

const h2Class =
  "text-3xl font-extrabold tracking-tight text-brand-900 sm:text-4xl";

function Watermark({ className }: { className: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 select-none text-center font-black leading-none ${className}`}
    >
      TIPTANG
    </div>
  );
}

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
        <Watermark className="bottom-0 text-[6rem] text-brand-900/5 sm:text-[11rem]" />
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
                inline so the CSS never depends on how many lines there are. */}
            <h1 className="rise mt-4 max-w-xl text-4xl font-extrabold leading-[1.05] tracking-tight text-brand-900 sm:text-5xl lg:text-6xl">
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
          <div className="flex justify-center lg:col-span-5 lg:justify-end">
            <Reveal delay={200} className="w-full max-w-sm">
              <HeroMock />
            </Reveal>
          </div>
        </div>

        {/* Status bar: the three micro-promises, no new copy */}
        <div className="relative mt-14 flex items-center justify-between gap-3 border-t border-brand-900/10 py-4 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
          <span>{micro[0]}</span>
          <span className="hidden sm:inline">{micro[1]}</span>
          <span>{micro[2]}</span>
        </div>
      </section>

      {/* ===== How it works — three ink cards ===== */}
      <Reveal>
        <section>
          <h2 className={h2Class}>{t("howItWorks")}</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className="ink lift relative min-h-[13rem] overflow-hidden rounded-3xl p-6"
              >
                <span
                  aria-hidden
                  className="absolute right-5 top-3 text-5xl font-black text-white/10"
                >
                  0{i + 1}
                </span>
                <div className="grid h-11 w-11 place-items-center rounded-full bg-brand-500/20 text-brand-400">
                  <Icon name={s.icon} className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-xl font-bold">
                  {s.title.replace(/^\d+\.\s*/, "")}
                </h3>
                <p className="mt-2 text-sm text-white/60">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>
      </Reveal>

      {/* ===== Why TipTang — numbered rows, no box ===== */}
      <Reveal>
        <section className="grid gap-8 lg:grid-cols-[1fr_2fr]">
          <h2 className={h2Class}>{t("featuresTitle")}</h2>
          <ol className="divide-y divide-brand-900/10">
            {features.map((f, i) => (
              <li
                key={f}
                className="flex items-start gap-4 rounded-2xl px-3 py-5 transition-colors hover:bg-brand-50"
              >
                <span className="w-8 shrink-0 pt-1 text-sm font-semibold text-brand-900/40">
                  0{i + 1}
                </span>
                <p className="flex-1 text-lg font-semibold text-brand-900">
                  {f}
                </p>
                <Icon
                  name="check-circle"
                  className="mt-1 h-5 w-5 shrink-0 text-brand-600"
                />
              </li>
            ))}
          </ol>
        </section>
      </Reveal>

      {/* ===== Comparison — same data, ink header, highlighted column ===== */}
      <Reveal>
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
                className="grid grid-cols-[1.4fr_1fr_1fr] border-t border-brand-900/10 text-sm transition-colors hover:bg-brand-50/60"
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
      </Reveal>

      {/* ===== FAQ — hairline rows ===== */}
      <Reveal>
        <section>
          <h2 className={h2Class}>{t("faqTitle")}</h2>
          <div className="mt-6 max-w-2xl divide-y divide-brand-900/10">
            {[1, 2, 3].map((n) => (
              <details key={n} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-lg font-semibold text-brand-900 [&::-webkit-details-marker]:hidden">
                  <span>{t(`faqQ${n}`)}</span>
                  <span
                    className="shrink-0 text-2xl leading-none text-brand-500 transition-transform group-open:rotate-45"
                    aria-hidden
                  >
                    ＋
                  </span>
                </summary>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-brand-900/70">
                  {t(`faqA${n}`)}
                </p>
              </details>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ===== Reviews (component untouched) ===== */}
      <Reveal>
        <ReviewsSection
          reviews={approved}
          average={avgRating}
          count={reviewCount}
        />
      </Reveal>

      {/* ===== Closing CTA band ===== */}
      <Reveal>
        <section className="ink relative overflow-hidden rounded-3xl p-8 sm:p-12">
          <Watermark className="-bottom-6 text-[7rem] text-white/5 sm:text-[11rem]" />
          <div className="relative max-w-xl">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              {t("ctaBandTitle")}
            </h2>
            <p className="mt-3 text-white/60">{t("ctaBandDesc")}</p>
            <div className="mt-8">
              <Pill
                href={loggedIn ? "/dashboard" : "/register"}
                variant="brand"
              >
                {loggedIn ? t("ctaDashboard") : t("ctaPrimary")}
              </Pill>
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
