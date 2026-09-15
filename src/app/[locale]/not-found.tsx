import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * 404 inside the locale shell (header, footer, theme), in the visitor's
 * language. Reached by any `notFound()` under [locale] — unknown creator,
 * expired order — and, via [...rest]/page.tsx, by any URL that matches
 * no route at all.
 */
export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-6xl font-black tabular-nums text-brand-300">404</p>
      <h1 className="mt-4 text-2xl font-extrabold text-brand-900">
        {t("title")}
      </h1>
      <p className="mt-2 text-brand-900/70">{t("desc")}</p>
      <Link href="/" className="btn-primary mt-8 inline-flex">
        {t("home")}
      </Link>
    </div>
  );
}
