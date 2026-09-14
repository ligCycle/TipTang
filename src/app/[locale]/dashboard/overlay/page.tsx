import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { OverlaySettings } from "@/components/OverlaySettings";

/**
 * OBS overlay settings on their own page. The component is set up once
 * and rarely revisited, so it no longer lives on the dashboard home.
 * `OverlaySettings` brings its own heading + card; nothing to add here.
 */
export default async function OverlayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionUser = await requireUser();
  if (!sessionUser) redirect(`/${locale}/login`);

  const t = await getTranslations("dashboard");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/${locale}/dashboard`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        ← {t("backToDashboard")}
      </Link>
      <OverlaySettings />
    </div>
  );
}
