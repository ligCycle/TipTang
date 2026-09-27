import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/Icon";
import { MarkUpdatesSeen } from "@/components/MarkUpdatesSeen";
import { UPDATES, type UpdateTag } from "@/lib/updates";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "updates" });
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: {
      canonical: `/${locale}/updates`,
      languages: { th: "/th/updates", en: "/en/updates", "x-default": "/th/updates" },
    },
  };
}

const TAG_STYLE: Record<UpdateTag, string> = {
  creator: "bg-brand-100 text-brand-700",
  supporter: "bg-sky-100 text-sky-800",
  security: "bg-emerald-100 text-emerald-800",
};

export default async function UpdatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("updates");
  const lang = locale === "th" ? "th" : "en";
  const tagLabel: Record<UpdateTag, string> = {
    creator: t("tagCreator"),
    supporter: t("tagSupporter"),
    security: t("tagSecurity"),
  };
  // ISO dates → "27 ก.ย. 2569" / "Sep 27, 2026". Noon UTC keeps the day
  // stable in Bangkok whatever the server's zone.
  const dayFormat = new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-US", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  });

  // Group consecutive entries by date (the list is already newest first).
  const groups: { date: string; items: typeof UPDATES }[] = [];
  for (const u of UPDATES) {
    const last = groups[groups.length - 1];
    if (last && last.date === u.date) last.items.push(u);
    else groups.push({ date: u.date, items: [u] });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <MarkUpdatesSeen />
      <header>
        <h1 className="text-4xl font-extrabold tracking-tight text-brand-900">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-brand-900/70">{t("intro")}</p>
      </header>

      {groups.map((g) => (
        <section key={g.date}>
          <h2 className="mb-2 text-sm font-semibold tabular-nums text-brand-900/55">
            <time dateTime={g.date}>
              {dayFormat.format(new Date(`${g.date}T12:00:00Z`))}
            </time>
          </h2>
          <ul className="divide-y divide-brand-900/10">
            {g.items.map((u) => (
              <li key={u.id} id={u.id} className="py-5">
                <div className="flex flex-wrap gap-1.5">
                  {u.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TAG_STYLE[tag]}`}
                    >
                      {tagLabel[tag]}
                    </span>
                  ))}
                </div>
                <h3 className="mt-2 text-lg font-bold text-brand-900">
                  {u[lang].title}
                </h3>
                <p className="mt-1 text-brand-900/70">{u[lang].body}</p>
                {u.href && (
                  <Link
                    href={u.href}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
                  >
                    {t("tryIt")}
                    <Icon name="arrow-right" className="h-3.5 w-3.5" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
