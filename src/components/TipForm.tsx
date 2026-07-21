"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatBaht } from "@/lib/format";

const QUICK_AMOUNTS = [20, 50, 100, 200, 500];
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

type Step = "form" | "pay" | "done";

export function TipForm({
  username,
  creatorName,
  accentColor,
}: {
  username: string;
  creatorName: string;
  accentColor?: string;
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

  const [step, setStep] = useState<Step>("form");
  const [amount, setAmount] = useState(50);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isPublic, setIsPublic] = useState(true);

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
    if (amount < 1) return;
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

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0] ?? null;
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
    setAmount(50);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (step === "done") {
    return (
      <section className="card rounded-3xl p-8 text-center">
        <div className="text-5xl">🎉</div>
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
    <section className="card rounded-3xl p-6 sm:p-8">
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
              {QUICK_AMOUNTS.map((a) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => setAmount(a)}
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
              min={1}
              max={100000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="input"
              required
            />
          </label>

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
            disabled={loading}
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
              ⬇ {t("saveQr")}
            </a>
            <p className="mx-auto mt-2 max-w-sm text-sm text-brand-900/60">
              {t("scanHint")}
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-brand-900/45">
              {t("saveQrHint")}
            </p>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-brand-900/80">
              {t("uploadSlip")}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onPickFile}
              className="block w-full text-sm text-brand-900/70 file:mr-3 file:rounded-full file:border-0 file:bg-brand-100 file:px-4 file:py-2 file:font-semibold file:text-brand-700"
            />
          </label>

          {slipPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slipPreview}
              alt="slip preview"
              className="mx-auto max-h-56 rounded-xl border border-brand-100"
            />
          )}

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
