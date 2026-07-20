"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function OverlaySettings() {
  const t = useTranslations("dashboard");
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reveal() {
    setLoading(true);
    try {
      const res = await fetch("/api/overlay/setup", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.key) {
        setUrl(
          `${window.location.origin}/overlay/${data.username}?key=${data.key}`,
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="card rounded-2xl p-5">
      <h2 className="text-lg font-bold text-brand-900">🔴 {t("obsTitle")}</h2>
      <p className="mt-1 text-sm text-brand-900/65">{t("obsDesc")}</p>

      {!url ? (
        <button
          onClick={reveal}
          disabled={loading}
          className="btn-secondary mt-4"
        >
          {loading ? "…" : t("obsReveal")}
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1 text-sm font-medium text-brand-900/70">
              {t("obsUrlLabel")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                className="input flex-1 text-xs"
              />
              <button onClick={copy} className="btn-secondary shrink-0 px-4 py-2 text-sm">
                {copied ? t("copied") : t("copyLink")}
              </button>
              <a
                href={`${url}&test=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                {t("obsPreview")}
              </a>
            </div>
          </div>
          <p className="text-xs text-brand-900/55">{t("obsHint")}</p>
        </div>
      )}
    </div>
  );
}
