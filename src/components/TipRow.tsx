"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { formatBaht, formatDate } from "@/lib/format";
import { Icon, type IconName } from "@/components/Icon";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type Tip = {
  id: string;
  supporterName: string;
  message: string | null;
  amount: number;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  slipUrl: string | null;
  /** Slip image removed by the 90-day retention job. */
  slipPurged: boolean;
  /** When that job will delete the slip (decided tips only), ISO. */
  slipDeleteAt: string | null;
  /** Deletion is less than a week away. */
  slipDeleteSoon: boolean;
  autoVerified: boolean;
  verifyCode: string | null;
  verifyDetail: string | null;
  timerEffect: "ADD" | "REDUCE" | "NONE";
  paymentMethod: "PROMPTPAY" | "PAYPAL";
  createdAt: string;
  /** Name (or "เสียง N") of the sound the fan picked; null = no pick. */
  pickedSound?: string | null;
  /** The wheel the fan asked to spin; null = no spin asked. */
  spinWheelId?: string | null;
  /** What the wheel landed on (confirmed tips). */
  spinResult?: string | null;
};

// Dashboard flag styling per verifier verdict. `ok` = amount + receiver matched
// (green, reassuring); the rest need a human look.
const VERIFY_STYLES: Record<string, string> = {
  match: "bg-emerald-100 text-emerald-800",
  amount: "bg-amber-100 text-amber-800",
  receiver: "bg-amber-100 text-amber-800",
  notslip: "bg-rose-100 text-rose-700",
  unreadable: "bg-gray-200 text-gray-600",
  pp_pending: "bg-amber-100 text-amber-800",
  pp_currency: "bg-sky-100 text-sky-800",
};

// The matching icon per verdict. The pill already carries the colour, so the
// icon just inherits it.
const VERIFY_ICONS: Record<string, IconName> = {
  match: "check-circle",
  amount: "alert-triangle",
  receiver: "alert-triangle",
  notslip: "alert-triangle",
  unreadable: "help-circle",
  pp_pending: "clock",
  pp_currency: "help-circle",
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Confirming a tip whose wheel is gone or empty asks first (409 wheel_empty).
  const [wheelEmpty, setWheelEmpty] = useState(false);
  const [resetFailed, setResetFailed] = useState(false);
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
        return t("verifyMatch");
      case "amount":
        return `${t("verifyAmount")}${tip.verifyDetail ? ` (${tip.verifyDetail})` : ""}`;
      case "receiver":
        return t("verifyReceiver");
      case "notslip":
        return t("verifyNotSlip");
      case "unreadable":
        return t("verifyUnreadable");
      case "pp_pending":
        return t("verifyPpPending");
      case "pp_currency":
        return t("verifyPpCurrency", { detail: tip.verifyDetail ?? "" });
      default:
        return "";
    }
  })();

  async function act(action: "confirm" | "reject", force = false) {
    setLoading(true);
    try {
      const res = await fetch(`/api/tips/${tip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, force }),
      });
      if (res.status === 409) {
        setWheelEmpty(true);
        return;
      }
      setWheelEmpty(false);
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  // "รีเซ็ตวงล้อแล้วยืนยัน": bring every segment back, then confirm (spins now).
  async function resetAndConfirm() {
    setLoading(true);
    setResetFailed(false);
    const res = await fetch(`/api/wheels/${tip.spinWheelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    }).catch(() => null);
    if (!res?.ok) {
      setResetFailed(true);
      setLoading(false);
      return;
    }
    await act("confirm");
  }

  // Runs after the creator confirms in the dialog.
  async function del() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tips/${tip.id}`, { method: "DELETE" });
      if (res.ok) {
        // The row unmounts on refresh — don't touch state afterwards.
        router.refresh();
        return;
      }
      setLoading(false);
      setDeleteOpen(false);
    } catch {
      setLoading(false);
      setDeleteOpen(false);
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
          {tip.timerEffect === "REDUCE" && (
            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
              {t("reduceBadge")}
            </span>
          )}
          {tip.timerEffect === "NONE" && (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-900/60">
              {t("noTimerBadge")}
            </span>
          )}
          {tip.paymentMethod === "PAYPAL" && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
              {t("paypalBadge")}
            </span>
          )}
          {tip.pickedSound != null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
              <Icon name="volume" className="h-3 w-3" />
              {t("pickedSoundBadge", { name: tip.pickedSound })}
            </span>
          )}
          {tip.spinResult ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
              <Icon name="wheel" className="h-3 w-3" />
              {t("spinBadge", { task: tip.spinResult })}
            </span>
          ) : tip.spinWheelId ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-900/60">
              <Icon name="wheel" className="h-3 w-3" />
              {tip.status === "CONFIRMED" ? t("spinNone") : t("spinAsked")}
            </span>
          ) : null}
          {tip.autoVerified && tip.verifyDetail !== "ocr" ? (
            <span
              title={t("autoBadgeTitle")}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700"
            >
              <Icon name="zap" className="h-3 w-3" />
              {t("autoBadge")}
            </span>
          ) : (
            tip.verifyCode &&
            VERIFY_STYLES[tip.verifyCode] && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${VERIFY_STYLES[tip.verifyCode]}`}
              >
                <Icon name={VERIFY_ICONS[tip.verifyCode]} className="h-3 w-3" />
                {verifyLabel}
              </span>
            )
          )}
        </div>
        <span className="text-lg font-extrabold text-tip-600">
          {formatBaht(tip.amount, currencyLocale)}
        </span>
      </div>

      {tip.message && <p className="mt-2 text-brand-900/75">{tip.message}</p>}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-brand-900/50">
          {formatDate(tip.createdAt, currencyLocale)}
          {tip.slipUrl && tip.slipDeleteAt && (
            <span
              className={
                tip.slipDeleteSoon
                  ? "font-semibold text-amber-600 dark:text-amber-400"
                  : undefined
              }
            >
              {" · "}
              {t("slipDeletesOn", {
                date: new Intl.DateTimeFormat(currencyLocale, {
                  dateStyle: "medium",
                  timeZone: "Asia/Bangkok",
                }).format(new Date(tip.slipDeleteAt)),
              })}
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {tip.status !== "CONFIRMED" && (
            <>
              <button
                onClick={() => setDeleteOpen(true)}
                disabled={loading}
                className="rounded-full border border-rose-200 px-3 py-1 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                {t("delete")}
              </button>
              <ConfirmDialog
                open={deleteOpen}
                message={t("deleteConfirm")}
                confirmLabel={t("delete")}
                danger
                busy={loading}
                onConfirm={del}
                onCancel={() => setDeleteOpen(false)}
              />
            </>
          )}
          {!tip.slipUrl && tip.slipPurged && (
            <span className="px-1 text-sm text-brand-900/50">
              {t("slipPurged")}
            </span>
          )}
          {tip.slipUrl && (
            <a
              href={tip.slipUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={loading}
              className={`rounded-full border border-brand-200 px-3 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 ${
                loading ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {tip.paymentMethod === "PAYPAL" ? t("viewReceipt") : t("viewSlip")}
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
      {/* Portal: the card's own styling would trap a fixed overlay inside it. */}
      {wheelEmpty && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="card w-full max-w-md rounded-2xl p-6 shadow-2xl">
            <p className="text-base font-semibold leading-relaxed text-brand-900">{t("spinEmptyTitle")}</p>
            <p className="mt-1 text-sm text-brand-900/65">{t("spinEmptyBody")}</p>
            {resetFailed && <p className="mt-2 text-sm font-medium text-red-600">{t("spinResetFailed")}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setWheelEmpty(false)}
                disabled={loading}
                className="btn-secondary px-4 py-2 text-sm"
              >
                {t("spinEmptyCancel")}
              </button>
              <button
                type="button"
                onClick={() => act("confirm", true)}
                disabled={loading}
                className="btn-secondary px-4 py-2 text-sm"
              >
                {t("spinEmptyForce")}
              </button>
              {!resetFailed && (
                <button type="button" onClick={resetAndConfirm} disabled={loading} className="btn-primary px-4 py-2 text-sm">
                  {t("spinEmptyReset")}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </li>
  );
}
