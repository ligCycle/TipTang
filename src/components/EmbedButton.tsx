"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Builds a self-contained inline-styled anchor so it renders identically on any
// host site (no external script/CSS needed).
function buildSnippet(url: string, label: string): string {
  return `<a href="${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:11px 20px;border-radius:9999px;background:#ec4899;color:#ffffff;font-family:system-ui,-apple-system,sans-serif;font-weight:700;font-size:15px;line-height:1;text-decoration:none;box-shadow:0 4px 14px rgba(236,72,153,.35);">${label}</a>`;
}

export function EmbedButton({ path }: { path: string }) {
  const t = useTranslations("dashboard");
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}${path}`);
  }, [path]);

  const label = `💸 ${t("embedBtnText")}`;
  const snippet = url ? buildSnippet(url, label) : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="card rounded-2xl p-5">
      <h2 className="text-lg font-bold text-brand-900">🔘 {t("embedTitle")}</h2>
      <p className="mt-1 text-sm text-brand-900/65">{t("embedDesc")}</p>

      {/* Live preview — exactly what will render on their site */}
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-brand-900/50">
          {t("embedPreview")}
        </p>
        <div className="flex justify-center rounded-xl border border-brand-200 bg-brand-50 p-5">
          {snippet ? (
            <div dangerouslySetInnerHTML={{ __html: snippet }} />
          ) : (
            <span className="text-sm text-brand-900/40">…</span>
          )}
        </div>
      </div>

      {/* Copy-paste HTML */}
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-brand-900/50">
          {t("embedCode")}
        </p>
        <textarea
          readOnly
          value={snippet}
          onFocus={(e) => e.currentTarget.select()}
          rows={4}
          className="input w-full resize-none font-mono text-xs"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={copy}
            className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {copied ? t("copied") : t("embedCopy")}
          </button>
          <span className="text-xs text-brand-900/50">{t("embedHint")}</span>
        </div>
      </div>
    </div>
  );
}
