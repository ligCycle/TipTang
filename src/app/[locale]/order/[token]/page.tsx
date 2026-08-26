import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { formatBaht } from "@/lib/format";
import { DeliverableBox } from "@/components/DeliverableBox";
import { Icon } from "@/components/Icon";

// Private receipt — never index (also status changes over time → always fresh).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-blue-100 text-blue-700",
  DELIVERED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default async function OrderReceiptPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("shop");

  // Public, token-gated. Select ONLY buyer-safe fields — never promptpayId etc.
  const order = await prisma.shopOrder.findUnique({
    where: { receiptToken: token },
    select: {
      itemTitle: true,
      amount: true,
      status: true,
      createdAt: true,
      deliverableText: true,
      buyerName: true,
    },
  });
  if (!order) notFound();

  const cur = locale === "th" ? "th-TH" : "en-US";
  const paid = order.status === "CONFIRMED" || order.status === "DELIVERED";

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="card rounded-3xl p-6">
        <h1 className="flex items-center gap-2 text-xl font-extrabold text-brand-900">
          <Icon name="receipt" className="h-5 w-5" />
          {t("receiptTitle")}
        </h1>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate font-semibold text-brand-900">
            {order.itemTitle}
          </span>
          <span className="shrink-0 rounded-full bg-brand-100 px-3 py-0.5 text-sm font-bold text-brand-700">
            {formatBaht(Number(order.amount), cur)}
          </span>
        </div>
        <div className="mt-3">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              STATUS_STYLES[order.status] ?? "bg-brand-100 text-brand-700"
            }`}
          >
            {t(`status_${order.status}`)}
          </span>
        </div>
      </div>

      {order.status === "PENDING" && (
        <div className="card flex items-center justify-center gap-2 rounded-3xl p-6 text-center text-brand-900/75">
          <Icon name="clock" />
          {t("receiptPending")}
        </div>
      )}

      {order.status === "REJECTED" && (
        <div className="card flex items-center justify-center gap-2 rounded-3xl p-6 text-center text-red-700">
          <Icon name="x-circle" />
          {t("receiptRejected")}
        </div>
      )}

      {paid && order.deliverableText && (
        <div className="card rounded-3xl p-6">
          <p className="mb-3 flex items-center gap-2 font-semibold text-brand-900">
            <Icon name="check-circle" className="text-emerald-600" />
            {t("receiptDigitalReady")}
          </p>
          <DeliverableBox text={order.deliverableText} />
        </div>
      )}

      {paid && !order.deliverableText && (
        <div className="card flex items-center justify-center gap-2 rounded-3xl p-6 text-center text-brand-900/75">
          <Icon name="check-circle" className="text-emerald-600" />
          {t("receiptCommissionDone")}
        </div>
      )}
    </div>
  );
}
