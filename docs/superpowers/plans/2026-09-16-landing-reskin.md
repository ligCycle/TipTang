# Landing Reskin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle `/[locale]` (the public landing page) in the "studio" language — ink cards, capsule buttons, hairline rows, light entrance/scroll reveals — in TipTang's pink palette, keeping every existing section, order and sales message.

**Architecture:** The page stays a server component with the same data fetching. New CSS utilities (`.ink`, `.pill*`, `.rise`, `.reveal`, `.lift`) live in `globals.css`. One tiny client component `Reveal` toggles a class via IntersectionObserver (no state). `HeroMock` is a static server component drawn with Tailwind. The inline theme script gains `html.js` so the hidden pre-reveal state only applies when JS runs.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, next-intl. No new dependencies.

Spec: `docs/superpowers/specs/2026-09-16-landing-reskin-design.md`

## Global Constraints

- Keep every existing `landing.*` i18n key and its text; only add keys.
- Do NOT modify `ReviewsSection.tsx`, `Header.tsx`, the footer, other pages, API, DB.
- No new dependency, no images, no loader, no smooth-scroll library.
- `npm run lint` stays at exactly **5** pre-existing errors — `Reveal` must not call setState in an effect (use a ref + classList).
- Reduced-motion block targets classes only, never `*`.
- Watermarks: `pointer-events-none select-none aria-hidden`, placed before content in DOM (lower z).
- `.rise` line delays come from inline `style` per line, not `nth-child`.
- Bash heredocs break on `'` here — write source files with the Write tool; splice JSON/CSS with Python.
- Branch `landing-reskin` (already created, spec committed). **Do not push**; the user reviews on localhost first.

---

### Task 1: CSS utilities + `html.js` + `arrow-right` icon

**Files:** `src/app/globals.css` (append before the dark-theme block), `src/app/[locale]/layout.tsx` (THEME_SCRIPT), `src/components/Icon.tsx`

- [ ] **Step 1: Append to `globals.css`** (insert just above `/* ===== Dark theme ===== */`)

```css
/* ===== Landing "studio" look =====
   Ink cards are a fixed near-black with a pink undertone — deliberately NOT
   theme-driven, because pink-on-ink is the whole point of the look. In dark
   mode the page itself is dark, so the card gets a hairline to stay legible. */
.ink {
  background: #14090f;
  color: #fff;
}
[data-theme="dark"] .ink {
  background: #1a0d14;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

/* Capsule button: label + a round arrow badge at the end. */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: 9999px;
  padding: 0.375rem 0.375rem 0.375rem 1.5rem;
  font-weight: 600;
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.pill:hover {
  transform: scale(1.03);
}
.pill-arrow {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 9999px;
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.pill:hover .pill-arrow {
  transform: translateX(3px);
}
/* No-arrow variant keeps the same height as an arrow pill. */
.pill-plain {
  padding: 0.75rem 1.75rem;
}
.pill-dark {
  background: #14090f;
  color: #fff;
}
.pill-dark .pill-arrow {
  background: #fff;
  color: #14090f;
}
.pill-brand {
  background: var(--color-brand-600);
  color: #fff;
}
.pill-brand .pill-arrow {
  background: #fff;
  color: var(--color-brand-700);
}
.pill-outline {
  border: 1px solid var(--color-brand-300);
  color: var(--color-brand-800);
}
[data-theme="dark"] .pill-dark {
  background: #fff;
  color: #14090f;
}
[data-theme="dark"] .pill-dark .pill-arrow {
  background: #14090f;
  color: #fff;
}

/* Hero headline: each line rises out of a clip on load. Per-line delay is
   set inline by the page, so the CSS is independent of line count/order. */
.rise > span {
  display: block;
  overflow: hidden;
}
.rise > span > span {
  display: block;
  transform: translateY(110%);
  opacity: 0;
  animation: rise 0.9s cubic-bezier(0.215, 0.61, 0.355, 1) forwards;
}
@keyframes rise {
  to {
    transform: none;
    opacity: 1;
  }
}

/* Scroll reveal. Hidden ONLY once JS has announced itself (html.js), so a
   no-JS visitor or crawler sees everything immediately. */
html.js .reveal {
  opacity: 0;
  transform: translateY(24px);
  transition:
    opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
}
html.js .reveal.is-in {
  opacity: 1;
  transform: none;
}

/* Cards that lift a little on hover. */
.lift {
  transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.lift:hover {
  transform: translateY(-4px);
}

/* One switch for all of the above. Scoped to these classes on purpose: a
   global `transform: none` would break layout transforms elsewhere. */
@media (prefers-reduced-motion: reduce) {
  .reveal,
  .rise > span > span,
  .pill,
  .pill-arrow,
  .lift {
    animation: none !important;
    transition: none !important;
  }
  .reveal,
  .rise > span > span {
    opacity: 1 !important;
    transform: none !important;
  }
}
```

- [ ] **Step 2: `html.js`** — in `THEME_SCRIPT` change the leading `(function(){try{` to `(function(){document.documentElement.classList.add('js');try{`.

- [ ] **Step 3: `arrow-right` icon** — add `| "arrow-right"` to `IconName` (alphabetical, after `alert-triangle`) and to `paths`:
```tsx
  "arrow-right": (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
```

- [ ] **Step 4:** `npx tsc --noEmit` clean → commit `"Landing look: ink/pill/rise/reveal utilities, html.js flag, arrow icon"`.

---

### Task 2: `Reveal` + `HeroMock` + i18n

**Files:** create `src/components/Reveal.tsx`, `src/components/HeroMock.tsx`; modify `messages/th.json`, `messages/en.json` (`landing`)

- [ ] **Step 1: `Reveal.tsx`**
```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fade-and-rise a block the first time it scrolls into view. Pure class
 * toggling through a ref — no state — so it never re-renders its children
 * and stays clear of the set-state-in-effect lint rule. The hidden start
 * state lives in CSS under `html.js`, so without JS nothing is hidden.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.classList.add("is-in");
        observer.disconnect(); // once is enough
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: `HeroMock.tsx`** (server component; `aria-hidden` root)
```tsx
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/Icon";

/**
 * A static mock of a creator's tip page, drawn with Tailwind only. It is
 * decoration that says "this is the product" — hidden from assistive tech.
 */
export async function HeroMock() {
  const t = await getTranslations("landing");
  return (
    <div aria-hidden className="relative w-full max-w-sm lg:rotate-2">
      <div className="rounded-3xl border border-brand-900/10 bg-white p-5 shadow-[0_30px_60px_-30px_rgba(153,23,72,.45)] dark:bg-brand-50">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-black text-white">
            T
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-brand-900">{t("mockName")}</p>
            <p className="text-sm font-medium text-brand-600">@yourname</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {["฿20", "฿50", "฿100"].map((amt, i) => (
            <div
              key={amt}
              className={`rounded-xl py-2 text-center text-sm font-bold ${
                i === 1
                  ? "bg-brand-600 text-white"
                  : "border border-brand-900/10 text-brand-900/80"
              }`}
            >
              {amt}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl border border-brand-900/10 px-3 py-2 text-sm text-brand-900/70">
          <Icon name="heart" className="h-4 w-4 text-brand-500" />
          {t("mockMessage")}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div className="grid aspect-square w-24 shrink-0 place-items-center rounded-2xl bg-brand-50 dark:bg-brand-100">
            <Icon name="smartphone" className="h-8 w-8 text-brand-400" />
          </div>
          <p className="text-sm font-medium text-brand-900/70">{t("mockScan")}</p>
        </div>
      </div>

      {/* The payoff: a confirmed tip, floating off the card's corner */}
      <div className="ink absolute -bottom-4 -right-2 flex -rotate-3 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg sm:-right-6">
        <Icon name="check-circle" className="h-4 w-4 text-emerald-400" />
        {t("mockPaid")}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: i18n** — insert after `"ctaMicro"` in both files (Python, validate JSON):

th:
```json
    "heroEyebrow": "ทางเลือกแทน TipMe · ฟรี 0%",
    "heroLine1": "รับทิปจากแฟนๆ",
    "heroLine2": "ผ่านพร้อมเพย์",
    "heroLine3": "ฟรี 100% ไม่หักสักบาท",
    "heroRating": "{avg} จาก {count} รีวิว",
    "ctaBandTitle": "พร้อมรับทิปแรกหรือยัง?",
    "ctaBandDesc": "สมัครฟรี ตั้งค่า 3 นาที ไม่ต้องใส่บัตร",
    "mockName": "ครีเอเตอร์ของคุณ",
    "mockMessage": "สู้ๆ นะ",
    "mockScan": "สแกนพร้อมเพย์จ่ายได้ทุกธนาคาร",
    "mockPaid": "โอนแล้ว ฿50",
```
en:
```json
    "heroEyebrow": "The TipMe alternative · 0% fees",
    "heroLine1": "Get tips from fans",
    "heroLine2": "via PromptPay",
    "heroLine3": "100% free, zero cut",
    "heroRating": "{avg} from {count} reviews",
    "ctaBandTitle": "Ready for your first tip?",
    "ctaBandDesc": "Free to join, 3-minute setup, no card needed",
    "mockName": "Your channel",
    "mockMessage": "You got this",
    "mockScan": "Scan PromptPay from any bank app",
    "mockPaid": "Paid ฿50",
```

- [ ] **Step 4:** `npx tsc --noEmit` → commit `"Add Reveal + HeroMock and the landing copy they need"`.

---

### Task 3: Rewrite `src/app/[locale]/page.tsx`

Keep imports/metadata/JSON-LD/data fetching identical; replace the JSX (and add imports for `Reveal`, `HeroMock`). Full file:

```tsx
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

const h2Class = "text-3xl font-extrabold tracking-tight text-brand-900 sm:text-4xl";

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
  variant: "dark" | "brand" | "outline";
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
    <Pill href="/dashboard" variant="dark">{t("ctaDashboard")}</Pill>
  ) : (
    <Pill href="/register" variant="dark">{t("ctaPrimary")}</Pill>
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
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
              {t("heroEyebrow")}
            </p>
            {/* Each line is clipped and rises on load; delay is per line
                inline so the CSS never depends on how many lines there are. */}
            <h1 className="rise mt-4 max-w-xl text-4xl font-extrabold leading-[1.05] tracking-tight text-brand-900 sm:text-5xl lg:text-6xl">
              {heroLines.map((line, i) => (
                <span key={line}>
                  <span
                    style={{ animationDelay: `${i * 120}ms` }}
                    className={i === heroLines.length - 1 ? "text-brand-600" : ""}
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
                <p className="flex-1 text-lg font-semibold text-brand-900">{f}</p>
                <Icon name="check-circle" className="mt-1 h-5 w-5 shrink-0 text-brand-600" />
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
        <ReviewsSection reviews={approved} average={avgRating} count={reviewCount} />
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
              <Pill href={loggedIn ? "/dashboard" : "/register"} variant="brand">
                {loggedIn ? t("ctaDashboard") : t("ctaPrimary")}
              </Pill>
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  );
}
```

- [ ] **Step 2:** `npx tsc --noEmit` · `npm run lint` (5) · `npm test` (7) → commit `"Landing page: studio look in TipTang pink — ink cards, capsule CTAs, light reveals"`.

---

### Task 4: Browser verification (public page, no login needed)

- [ ] `rm -rf .next` after any build; dev server via `preview_start`.
- [ ] `/th`: `document.querySelectorAll('h1 .rise > span').length === 3`; `html.classList.contains('js')`; `.ink` count ≥ 5; `.card` count equals only ReviewsSection's (compare against `document.querySelectorAll('section:has(h2) .card')` inside reviews).
- [ ] Reveal: on load, later sections have `reveal` without `is-in`; `scrollTo` bottom → all `is-in`. Remove `js` class → computed opacity of `.reveal` is `1`.
- [ ] Mobile 375: `scrollWidth <= 375`; comparison grid shows 3 columns; if overflow, wrap the table in `overflow-x-auto` with a right-edge gradient overlay and re-measure.
- [ ] Dark mode: `.ink` has visible border; pills invert correctly.
- [ ] `/en`: no `MISSING_MESSAGE` in console; all new strings render.
- [ ] Logged in (user is signed in in the pane): hero + CTA band both say "ไปที่หน้าหลัก".
- [ ] `npm run build` passes; then `rm -rf .next`, restart dev for the user. **Do not push.**

## Self-review
- Spec coverage: sections/order/copy kept (T3), ink/pill/rows (T1,T3), palette + dark (T1), motion level 1 only (T1,T3), no-JS safe via `html.js` (T1), reduced-motion scoped (T1), watermarks with pointer-events/select/aria (T3 `Watermark`), mobile table check (T4), untouched ReviewsSection (T3), SEO metadata/JSON-LD unchanged (T3), i18n add-only (T2), no push (T4).
- Types: `IconName` gains `arrow-right` (T1) used in T3; `Reveal` props `{children, delay?, className?}` match usage; `HeroMock` async server component rendered inside `Reveal` (client) — allowed because it is passed as children from a server component.
- `Pill` uses `children: string` — every call passes a translated string.
