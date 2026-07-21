"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const CATEGORIES = ["bug", "payment", "suggestion", "other"] as const;
type Category = (typeof CATEGORIES)[number];

export function ReportForm() {
  const t = useTranslations("report");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, message }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("sent");
      setMessage("");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="card rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand-900">
            🛟 {t("title")}
          </h2>
          <p className="mt-1 text-sm text-brand-900/65">{t("desc")}</p>
        </div>
        {!open && (
          <button
            onClick={() => {
              setOpen(true);
              setStatus("idle");
            }}
            className="btn-secondary shrink-0"
          >
            {t("openButton")}
          </button>
        )}
      </div>

      {open &&
        (status === "sent" ? (
          <div className="mt-4 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800">
            ✓ {t("sent")}
            <button
              onClick={() => setStatus("idle")}
              className="ml-2 font-semibold underline"
            >
              {t("sendAnother")}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div>
              <span className="mb-1 block text-sm font-medium text-brand-900/80">
                {t("categoryLabel")}
              </span>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      category === c
                        ? "bg-brand-600 text-white"
                        : "border border-brand-200 bg-brand-50 text-brand-800 hover:bg-brand-100"
                    }`}
                  >
                    {t(`category_${c}`)}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-900/80">
                {t("messageLabel")}
              </span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("messagePlaceholder")}
                maxLength={1000}
                rows={4}
                className="input resize-none"
                required
              />
            </label>

            {status === "error" && (
              <p className="text-sm font-medium text-red-600">{t("error")}</p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={status === "sending"}
                className="btn-primary"
              >
                {status === "sending" ? t("sending") : t("submit")}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-secondary"
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        ))}
    </div>
  );
}
