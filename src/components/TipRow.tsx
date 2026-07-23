"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { formatBaht, formatDate } from "@/lib/format";

type Tip = {
  id: string;
  supporterName: string;
  message: string | null;
  amount: number;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  slipUrl: string | null;
  autoVerified: boolean;
  verifyCode: string | null;
  verifyDetail: string | null;
  createdAt: string;
};

// Dashboard flag styling per verifier verdict. `ok` = amount + receiver matched
// (green, reassuring); the rest need a human look.
const VERIFY_STYLES: Record<string, string> = {
  match: "bg-emerald-100 text-emerald-800",
  amount: "bg-amber-100 text-amber-800",
  receiver: "bg-amber-100 text-amber-800",
  notslip: "bg-rose-100 text-rose-700",
  unreadable: "bg-gray-200 text-gray-600",
};

const STATUS_STYLES: Record<Tip["status"], string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-gray-200 text-gray-600",
};

export function TipRow({ tip, locale }: { tip: Tip; locale: string }) {
  const t = useTranslations("dashboard");
  const tp = useTranslations("profile");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const currencyLocale = locale === "th" ? "th-TH" : "en-US";

  const statusLabel = {
    PENDING: t("statusPending"),
    CONFIRMED: t("statusConfirmed"),
    REJECTED: t("statusRejected"),
  }[tip.status];

  // Build the verifier-flag label (shown when a tip wasn't auto-confirmed).
  const verifyLabel = (() => {
    switch (tip.verifyCode) {
      case "match":
        return `✅ ${t("verifyMatch")}`;
      case "amount":
        return `⚠️ ${t("verifyAmount")}${tip.verifyDetail ? ` (${tip.verifyDetail})` : ""}`;
      case "receiver":
        return `⚠️ ${t("verifyReceiver")}`;
      case "notslip":
        return `⚠️ ${t("verifyNotSlip")}`;
      case "unreadable":
        return `❓ ${t("verifyUnreadable")}`;
      default:
        return "";
    }
  })();

  async function act(action: "confirm" | "reject") {
    setLoading(true);
    try {
      const res = await fetch(`/api/tips/${tip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="card rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-brand-800">
            {tip.supporterName || tp("namePlaceholder")}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[tip.status]}`}
          >
            {statusLabel}
          </span>
          {tip.autoVerified ? (
            <span
              title="auto-verified"
              className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700"
            >
              ⚡ auto
            </span>
          ) : (
            tip.verifyCode &&
            VERIFY_STYLES[tip.verifyCode] && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${VERIFY_STYLES[tip.verifyCode]}`}
              >
                {verifyLabel}
              </span>
            )
          )}
        </div>
        <span className="text-lg font-extrabold text-brand-700">
          {formatBaht(tip.amount, currencyLocale)}
        </span>
      </div>

      {tip.message && <p className="mt-2 text-brand-900/75">{tip.message}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-brand-900/50">
          {formatDate(tip.createdAt, currencyLocale)}
        </span>
        <div className="flex items-center gap-2">
          {tip.slipUrl && (
            <a
              href={tip.slipUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-brand-200 px-3 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              {t("viewSlip")}
            </a>
          )}
          {tip.status === "PENDING" && (
            <>
              <button
                onClick={() => act("reject")}
                disabled={loading}
                className="rounded-full border border-gray-300 px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                {t("reject")}
              </button>
              <button
                onClick={() => act("confirm")}
                disabled={loading}
                className="rounded-full bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {t("confirm")}
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
