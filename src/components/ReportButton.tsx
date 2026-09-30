"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";

const CATEGORIES = ["bug", "payment", "suggestion", "other"] as const;
type Category = (typeof CATEGORIES)[number];

/**
 * "Report a problem" pill for the dashboard's top row. Opens the report form
 * in a native <dialog> (same approach as ConfirmDialog: showModal() brings
 * the backdrop, focus trap and Escape for free), so a creator can reach it
 * without scrolling past their whole tip list.
 */
export function ReportButton({ className }: { className: string }) {
  const t = useTranslations("report");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  function open() {
    if (status !== "sending") setStatus("idle");
    dialogRef.current?.showModal();
    textRef.current?.focus();
  }

  function close() {
    dialogRef.current?.close();
  }

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
    <>
      <button type="button" onClick={open} className={className}>
        <Icon name="life-buoy" />
        {t("openButton")}
      </button>

      <dialog
        ref={dialogRef}
        // Escape mid-send would hide the result; wait for it.
        onCancel={(e) => {
          if (status === "sending") e.preventDefault();
        }}
        // A click whose target is the dialog itself (not the panel) is the backdrop.
        onClick={(e) => {
          if (e.target === e.currentTarget && status !== "sending") close();
        }}
        // m-auto centres a modal <dialog> (Tailwind's preflight zeroes the
        // browser's own margin: auto) — see ConfirmDialog.
        className="card m-auto w-[min(92vw,32rem)] rounded-2xl border-0 p-0 text-brand-900 backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        <div className="p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-brand-900">
                <Icon name="life-buoy" className="h-5 w-5" />
                {t("title")}
              </h2>
              <p className="mt-1 text-sm text-brand-900/65">{t("desc")}</p>
            </div>
            <button
              type="button"
              onClick={close}
              disabled={status === "sending"}
              aria-label={t("close")}
              className="rounded-full p-1.5 text-brand-900/50 hover:bg-brand-100 hover:text-brand-900"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>

          {status === "sent" ? (
            <div className="mt-4 space-y-4">
              <p className="flex items-start gap-1.5 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800">
                <Icon name="check" className="mt-0.5 shrink-0" />
                {t("sent")}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("idle")}
                  className="btn-secondary px-4 py-2 text-sm"
                >
                  {t("sendAnother")}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  {t("close")}
                </button>
              </div>
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
                  ref={textRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("messagePlaceholder")}
                  maxLength={1000}
                  rows={5}
                  className="input resize-none"
                  required
                />
              </label>

              {status === "error" && (
                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                  {t("error")}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={status === "sending"}
                  className="btn-secondary px-4 py-2 text-sm"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  {status === "sending" ? t("sending") : t("submit")}
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
