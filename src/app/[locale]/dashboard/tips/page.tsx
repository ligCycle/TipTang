import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { TipList, TIP_FILTERS, type TipFilter } from "@/components/TipList";
import { AutoRefresh } from "@/components/AutoRefresh";

/** The full tip list (the dashboard home shows only the latest few). */
export default async function TipsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const { status } = await searchParams;
  const filter: TipFilter = (TIP_FILTERS as readonly string[]).includes(status ?? "")
    ? (status as TipFilter)
    : "all";
  setRequestLocale(locale);

  const sessionUser = await requireUser();
  if (!sessionUser) redirect(`/${locale}/login`);

  return (
    <div className="space-y-6">
      {/* Keep the list fresh without a manual reload. */}
      <AutoRefresh />
      <TipList userId={sessionUser.id} locale={locale} filter={filter} />
    </div>
  );
}
