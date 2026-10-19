import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { featureLayout } from "@/lib/feature-layout-server";
import { SubathonFeature } from "@/components/features/FeaturePages";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionUser = await requireUser();
  if (!sessionUser) redirect(`/${locale}/login`);

  const data = await featureLayout(sessionUser.id);
  if (!data) return null;

  return <SubathonFeature layout={data.layout} />;
}
