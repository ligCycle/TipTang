"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatBaht } from "@/lib/format";
import { SlipDropzone } from "@/components/SlipDropzone";
import { Icon } from "@/components/Icon";

const QUICK_AMOUNTS = [20, 50, 100, 200, 500];

/**
 * Quick-pick chips that respect the creator's minimum. If the standard set is
 * mostly wiped out by a high minimum, offer multiples of the minimum instead
 * so the row never ends up empty.
 */
function quickAmountsFor(min: number): number[] {
  const kept = QUICK_AMOUNTS.filter((a) => a >= min);
  return kept.length >= 3 ? kept : [min, min * 2, min * 5, min * 10];
}
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

type Step = "form" | "pay" | "done";

type TimerEffect = "ADD" | "REDUCE" | "NONE";

export function TipForm({
  username,
  creatorName,
  accentColor,
  timerChoice = null,
  minAmount = 1,
}: {
  username: string;
  creatorName: string;
  accentColor?: string;
  /** Creator-chosen minimum tip in baht (1 = none). */
  minAmount?: number;
  /** Present whenever the creator runs a subathon timer; `reduceEnabled`
   *  adds the sabotage option. */
  timerChoice?: {
    reduceEnabled: boolean;
    minAmount: number;
    addBaht: number;
    addMin: number;
    reduceBaht: number;
    reduceMin: number;
  } | null;
}) {
  const t = useTranslations("profile");
  const tSuccess = useTranslations("tipSuccess");
  const tErr = useTranslations("errors");
  const locale = useLocale();
  const currencyLocale = locale === "th" ? "th-TH" : "en-US";

  // Recolor the primary button/selected chip with the creator's accent.
  // Inline background overrides .btn-primary's solid bg; hover feedback comes
  // from a brightness filter (not a bg swap) so hover keeps working.
  const primaryStyle = accentColor
    ? { backgroundColor: accentColor }
    : undefined;
  const cardTintStyle = accentColor
    ? {
        backgroundImage: `linear-gradient(155deg, color-mix(in srgb, ${accentColor} 16%, transparent), color-mix(in srgb, ${accentColor} 5%, transparent))`,
      }
    : undefined;

  const [step, setStep] = useState<Step>("form");
  // Keep the amount as the raw input string so clearing the field leaves it
  // empty (not a stubborn "0" that's annoying to type over); derive the number.
  const quickAmounts = quickAmountsFor(minAmount);
  const defaultAmount = quickAmounts.includes(50) ? 50 : quickAmounts[0];
  const [amountStr, setAmountStr] = useState(String(defaultAmount));
  const amount = amountStr.trim() === "" ? 0 : Number(amountStr);
  const belowMinimum = amount > 0 && amount < minAmount;
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  // Always starts (and resets) on ADD so a hurried supporter never sabotages
  // the stream by accident.
  const [timerEffect, setTimerEffect] = useState<TimerEffect>("ADD");
  const reduceTooSmall =
    timerChoice !== null &&
    timerEffect === "REDUCE" &&
    amount < timerChoice.minAmount;

  const [qr, setQr] = useState<string | null>(null);
  const [slip, setSlip] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoVerified, setAutoVerified] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function generateQr(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!Number.isFinite(amount) || amount < 1) return;
    setLoading(true);
    try {
      const res = await fetch("/api/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, amount }),
      });
      if (!res.ok) {
        setError(t("notConfigured"));
        return;
      }
      const data = await res.json();
      setQr(data.dataUrl);
      setStep("pay");
    } catch {
      setError(t("notConfigured"));
    } finally {
      setLoading(false);
    }
  }

  function handleFile(file: File | null) {
    setError(null);
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      setError(tErr("badType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(tErr("tooLarge"));
      return;
    }
    setSlip(file);
    setSlipPreview(URL.createObjectURL(file));
  }

  async function submitTip(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!slip) {
      setError(t("slipRequired"));
      return;
    }
    setLoading(true);
    try {
      const fd = new FormData();
      fd.set("username", username);
      fd.set("amount", String(amount));
      fd.set("supporterName", name);
      fd.set("message", message);
      fd.set("isMessagePublic", isPublic ? "true" : "false");
      fd.set("timerEffect", timerChoice ? timerEffect : "ADD");
      fd.set("slip", slip);

      const res = await fetch("/api/tips", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const map: Record<string, string> = {
          too_large: tErr("tooLarge"),
          bad_type: tErr("badType"),
          rate_limited: tErr("rateLimited"),
          duplicate_slip: tErr("duplicateSlip"),
          slip_required: t("slipRequired"),
          reduce_not_allowed: tErr("reduceNotAllowed"),
          below_minimum: t("minAmountHint", { min: minAmount }),
        };
        setError(map[data.error] ?? tErr("notFound"));
        return;
      }
      const data = await res.json().catch(() => ({}));
      setAutoVerified(Boolean(data.autoVerified) || Boolean(data.confirmed));
      setStep("done");
    } catch {
      setError(tErr("notFound"));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep("form");
    setQr(null);
    setSlip(null);
    setSlipPreview(null);
    setName("");
    setMessage("");
    setAmountStr(String(defaultAmount));
    setTimerEffect("ADD");
    if (fileRef.current) fileRef.current.value = "";
  }

  if (step === "done") {
    return (
      <section
        className="card rounded-3xl p-8 text-center"
        style={cardTintStyle}
      >
        <Icon name="check-circle" className="mx-auto h-14 w-14 text-emerald-500" />
        <h2 className="mt-3 text-xl font-bold text-brand-900">
          {tSuccess("title")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-brand-900/70">
          {autoVerified ? tSuccess("messageAuto") : tSuccess("message")}
        </p>
        <button onClick={reset} className="btn-secondary mt-6">
          {tSuccess("backToProfile")}
        </button>
      </section>
    );
  }

  return (
    <section className="card rounded-3xl p-6 sm:p-8" style={cardTintStyle}>
      <h2 className="mb-5 text-xl font-bold text-brand-900">
        {t("supportTitle", { name: creatorName })}
      </h2>

      {step === "form" && (
        <form onSubmit={generateQr} className="space-y-5">
          <div>
            <span className="mb-2 block text-sm font-medium text-brand-900/80">
              {t("quickAmount")}
            </span>
            <div className="flex flex-wrap gap-2">
              {quickAmounts.map((a) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => setAmountStr(String(a))}
                  style={amount === a ? primaryStyle : undefined}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    amount === a
                      ? "bg-brand-600 text-white"
                      : "border border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-brand-900/80">
              {t("amountLabel")}
            </span>
            <input
              type="number"
              min={minAmount}
              max={100000}
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="input"
              required
            />
            {minAmount > 1 && (
              <span
                className={`mt-1 block text-xs ${
                  belowMinimum ? "font-medium text-red-600" : "text-brand-900/55"
                }`}
              >
                {t("minAmountHint", { min: minAmount })}
              </span>
            )}
          </label>

          {timerChoice && (
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-brand-900/80">
                {t("timerChoiceLabel")}
              </legend>
              <div
                className={`grid gap-2 ${
                  timerChoice.reduceEnabled ? "grid-cols-3" : "grid-cols-2"
                }`}
              >
                {(
                  [
                    ["ADD", t("timerAdd")],
                    ...(timerChoice.reduceEnabled
                      ? [["REDUCE", t("timerReduce")]]
                      : []),
                    ["NONE", t("timerNone")],
                  ] as [TimerEffect, string][]
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setTimerEffect(value)}
                    aria-pressed={timerEffect === value}
                    style={timerEffect === value ? primaryStyle : undefined}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                      timerEffect === value
                        ? "bg-brand-600 text-white"
                        : "border border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-brand-900/55">
                {timerChoice.reduceEnabled
                  ? t("timerRateHint", {
                      addBaht: timerChoice.addBaht,
                      addMin: timerChoice.addMin,
                      reduceBaht: timerChoice.reduceBaht,
                      reduceMin: timerChoice.reduceMin,
                      min: timerChoice.minAmount,
                    })
                  : t("timerRateHintAddOnly", {
                      addBaht: timerChoice.addBaht,
                      addMin: timerChoice.addMin,
                    })}
              </p>
              {reduceTooSmall && (
                <p className="mt-1 text-sm font-medium text-red-600">
                  {t("timerReduceMin", { min: timerChoice.minAmount })}
                </p>
              )}
            </fieldset>
          )}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-brand-900/80">
              {t("nameLabel")}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              maxLength={60}
              className="input"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-brand-900/80">
              {t("messageLabel")}
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("messagePlaceholder")}
              maxLength={300}
              rows={3}
              className="input resize-none"
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-brand-900/80">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="h-4 w-4 accent-brand-600"
            />
            {t("showPublic")}
          </label>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading || reduceTooSmall || belowMinimum}
            style={primaryStyle}
            className="btn-primary w-full transition hover:brightness-95"
          >
            {loading ? t("generating") : t("generateQr")}
          </button>
        </form>
      )}

      {step === "pay" && qr && (
        <form onSubmit={submitTip} className="space-y-5">
          <div className="text-center">
            <p className="font-semibold text-brand-900">
              {t("scanToPay", { amount: formatBaht(amount, currencyLocale) })}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr}
              alt="PromptPay QR"
              className="mx-auto mt-3 h-60 w-60 rounded-2xl border border-brand-100 bg-white p-2"
            />
            <a
              href={qr}
              download={`promptpay-${amount}.png`}
              className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-200"
            >
              <Icon name="download" />
              {t("saveQr")}
            </a>
            <p className="mx-auto mt-2 max-w-sm text-sm text-brand-900/60">
              {t("scanHint")}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-brand-900/45">
              {t("saveQrHint")}
            </p>
            <p className="mx-auto mt-3 flex max-w-sm items-center justify-center gap-2 rounded-lg bg-brand-100/60 px-3 py-2 text-xs font-medium text-brand-900/70">
              <Icon name="smartphone" className="h-3.5 w-3.5" />
              <span>{t("payAnyApp")}</span>
            </p>
          </div>

          <SlipDropzone
            previewUrl={slipPreview}
            fileName={slip?.name}
            onFile={handleFile}
            label={t("uploadSlip")}
            hint={t("uploadSlipHint")}
            changeLabel={t("uploadSlipChange")}
            inputRef={fileRef}
            accentColor={accentColor}
          />

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setError(null);
              }}
              className="btn-secondary flex-1"
            >
              {t("changeAmount")}
            </button>
            <button
              type="submit"
              disabled={loading}
              style={primaryStyle}
              className="btn-primary flex-1 transition hover:brightness-95"
            >
              {loading ? t("submitting") : t("submitTip")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
