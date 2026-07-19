import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";
import { ReviewModRow } from "@/components/ReviewModRow";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const admin = await requireAdmin();
  if (!admin) redirect(`/${locale}`);

  const t = await getTranslations("admin");

  const reviews = await prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      rating: true,
      comment: true,
      status: true,
      createdAt: true,
    },
  });

  const rows = reviews.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  const pending = rows.filter((r) => r.status === "PENDING");
  const rest = rows.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-extrabold text-brand-900">{t("title")}</h1>

      <section>
        <h2 className="mb-4 text-lg font-bold text-brand-900">
          {t("pendingTab")} ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="card rounded-2xl p-6 text-center text-brand-900/60">
            {t("noPending")}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {pending.map((r) => (
              <ReviewModRow key={r.id} review={r} />
            ))}
          </ul>
        )}
      </section>

      {rest.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-brand-900">{t("allTitle")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {rest.map((r) => (
              <ReviewModRow key={r.id} review={r} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
