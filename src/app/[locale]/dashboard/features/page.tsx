import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { FeatureHub } from "@/components/features/FeatureHub";

/** The "ลูกเล่น" hub: single OBS link + on/off cards for every feature. */
export default async function FeaturesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionUser = await requireUser();
  if (!sessionUser) redirect(`/${locale}/login`);

  const t = await getTranslations("featureHub");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-brand-900/65">{t("desc")}</p>
      </div>
      <FeatureHub />
    </div>
  );
}
