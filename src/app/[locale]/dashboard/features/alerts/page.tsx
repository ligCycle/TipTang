import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AlertsFeature } from "@/components/features/FeaturePages";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionUser = await requireUser();
  if (!sessionUser) redirect(`/${locale}/login`);

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { alertsEnabled: true },
  });
  if (!user) return null;

  return <AlertsFeature alertsEnabled={user.alertsEnabled} />;
}
