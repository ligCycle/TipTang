import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ShopManager } from "@/components/ShopManager";
import { SHOP_ENABLED } from "@/lib/features";

export default async function ShopPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Shop is hidden for now — no direct access while disabled.
  if (!SHOP_ENABLED) redirect(`/${locale}/dashboard`);
  const t = await getTranslations("shop");
  const tc = await getTranslations("common");

  const session = await auth();
  const userId = session!.user.id;

  const [items, orders] = await Promise.all([
    prisma.shopItem.findMany({
      where: { creatorId: userId, isArchived: false },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        price: true,
        imageUrl: true,
        deliverableText: true,
        active: true,
      },
    }),
    prisma.shopOrder.findMany({
      where: { creatorId: userId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        itemTitle: true,
        buyerName: true,
        buyerContact: true,
        note: true,
        amount: true,
        slipUrl: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-brand-900">
          🛒 {t("dashboardTitle")}
        </h1>
        <Link
          href={`/${locale}/dashboard`}
          className="rounded-full border border-brand-300 bg-brand-50/70 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-100"
        >
          ← {tc("dashboard")}
        </Link>
      </div>

      <ShopManager
        items={items.map((i) => ({ ...i, price: Number(i.price) }))}
        orders={orders.map((o) => ({
          ...o,
          amount: Number(o.amount),
          createdAt: o.createdAt.toISOString(),
        }))}
        locale={locale}
      />
    </div>
  );
}
