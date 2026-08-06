"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatBaht } from "@/lib/format";
import { SlipDropzone } from "@/components/SlipDropzone";

export type ShopItem = {
  id: string;
  type: "DIGITAL" | "COMMISSION";
  title: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
};

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export function ShopCheckout({
  username,
  items,
  accentColor,
}: {
  username: string;
  items: ShopItem[];
  accentColor?: string;
}) {
  const t = useTranslations("shop");
  const tErr = useTranslations("errors");
  const locale = useLocale();
  const currencyLocale = locale === "th" ? "th-TH" : "en-US";

  const [sel, setSel] = useState<ShopItem | null>(null);
  const [step, setStep] = useState<"pay" | "done">("pay");
  const [receiptToken, setReceiptToken] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [slip, setSlip] = useState<File | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const primaryStyle = accentColor ? { backgroundColor: accentColor } : undefined;

  async function openItem(item: ShopItem) {
    setSel(item);
    setStep("pay");
    setError(null);
    setReceiptToken(null);
    setConfirmed(false);
    setQr(null);
    setBuyerName("");
    setContact("");
    setNote("");
    setSlip(null);
    setSlipPreview(null);
    try {
      const res = await fetch("/api/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, amount: item.price }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.dataUrl) setQr(data.dataUrl);
    } catch {
      // ignore — QR just won't show
    }
  }

  function handleFile(file: File | null) {
    setError(null);
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return setError(tErr("badType"));
    if (file.size > MAX_BYTES) return setError(tErr("tooLarge"));
    setSlip(file);
    setSlipPreview(URL.createObjectURL(file));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sel) return;
    if (!contact.trim()) return setError(t("contactRequired"));
    if (!slip) return setError(t("slipRequired"));
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("itemId", sel.id);
      fd.set("buyerName", buyerName);
      fd.set("buyerContact", contact);
      fd.set("note", note);
      fd.set("slip", slip);
      const res = await fetch("/api/shop/orders", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        const map: Record<string, string> = {
          duplicate_slip: tErr("duplicateSlip"),
          rate_limited: tErr("rateLimited"),
          too_large: tErr("tooLarge"),
          bad_type: tErr("badType"),
        };
        setError(map[d.error] ?? tErr("notFound"));
        return;
      }
      const d = await res.json().catch(() => ({}));
      setReceiptToken(d.receiptToken ?? null);
      setConfirmed(Boolean(d.confirmed));
      setStep("done");
    } catch {
      setError(tErr("notFound"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-bold text-brand-900">🛒 {t("title")}</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="card flex flex-col rounded-2xl p-4">
            {item.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt=""
                className="mb-3 h-32 w-full rounded-xl object-cover"
              />
            )}
            <span className="text-xs font-semibold uppercase text-brand-500">
              {item.type === "COMMISSION" ? t("typeCommission") : t("typeDigital")}
            </span>
            <h3 className="font-bold text-brand-900">{item.title}</h3>
            {item.description && (
              <p className="mt-1 flex-1 text-sm text-brand-900/70">
                {item.description}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-lg font-black text-brand-700">
                {formatBaht(item.price, currencyLocale)}
              </span>
              <button
                onClick={() => openItem(item)}
                style={primaryStyle}
                className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-95"
              >
                {t("buy")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Checkout modal */}
      {sel && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="card mt-8 w-full max-w-md rounded-3xl p-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-brand-900">{sel.title}</h3>
              <button
                onClick={() => setSel(null)}
                className="rounded-full px-2 text-brand-900/50 hover:bg-brand-100"
                aria-label={t("close")}
              >
                ✕
              </button>
            </div>

            {step === "done" ? (
              <div className="py-6 text-center">
                <div className="text-4xl">🎉</div>
                <p className="mt-3 font-semibold text-brand-900">
                  {confirmed ? t("doneConfirmedReceipt") : t("doneWithReceipt")}
                </p>
                {receiptToken && (
                  <>
                    <a
                      href={`/${locale}/order/${receiptToken}`}
                      style={primaryStyle}
                      className="btn-primary mt-4 inline-block transition hover:brightness-95"
                    >
                      {t("ctaViewOrder")}
                    </a>
                    <p className="mx-auto mt-2 max-w-xs text-xs text-brand-900/50">
                      {t("receiptSaveLink")}
                    </p>
                  </>
                )}
                <button
                  onClick={() => setSel(null)}
                  className="btn-secondary mx-auto mt-4 block"
                >
                  {t("close")}
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <p className="text-center font-semibold text-brand-900">
                  {t("scanToPay", {
                    amount: formatBaht(sel.price, currencyLocale),
                  })}
                </p>
                {qr && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qr}
                      alt="PromptPay QR"
                      className="mx-auto h-52 w-52 rounded-2xl border border-brand-100 bg-white p-2"
                    />
                    <p className="mx-auto max-w-sm rounded-lg bg-brand-100/60 px-3 py-2 text-xs font-medium text-brand-900/70">
                      📱 {t("payAnyApp")}
                    </p>
                  </>
                )}
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-brand-900/80">
                    {t("nameLabel")}
                  </span>
                  <input
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    maxLength={60}
                    className="input"
                    placeholder={t("namePlaceholder")}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-brand-900/80">
                    {t("contactLabel")}
                  </span>
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    maxLength={200}
                    className="input"
                    placeholder={t("contactPlaceholder")}
                    required
                  />
                  <span className="mt-1 block text-xs text-brand-900/50">
                    {t("contactHint")}
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-brand-900/80">
                    {t("noteLabel")}
                  </span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={300}
                    rows={2}
                    className="input resize-none"
                    placeholder={t("notePlaceholder")}
                  />
                </label>
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
                {error && (
                  <p className="text-sm font-medium text-red-600">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  style={primaryStyle}
                  className="btn-primary w-full transition hover:brightness-95"
                >
                  {loading ? t("submitting") : t("submitOrder")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
