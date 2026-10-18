import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { TipList } from "@/components/TipList";
import { AutoRefresh } from "@/components/AutoRefresh";

/** The full tip list (the dashboard home shows only the latest few). */
export default async function TipsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionUser = await requireUser();
  if (!sessionUser) redirect(`/${locale}/login`);

  return (
    <div className="space-y-6">
      {/* Keep the list fresh without a manual reload. */}
      <AutoRefresh />
      <TipList userId={sessionUser.id} locale={locale} />
    </div>
  );
}
