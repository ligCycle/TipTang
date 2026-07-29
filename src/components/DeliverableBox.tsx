"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Match http(s) URLs only — never other schemes (e.g. javascript:) so we can
// safely turn matched substrings into anchors.
const URL_RE = /(https?:\/\/[^\s]+)/g;

/**
 * Renders a digital deliverable (link / key / message) on the buyer's receipt.
 * Auto-links any URLs (mobile-friendly — no manual copy needed), plus a copy
 * button and a prominent "open link" button when the text contains a URL.
 */
export function DeliverableBox({ text }: { text: string }) {
  const t = useTranslations("shop");
  const [copied, setCopied] = useState(false);

  const parts = text.split(URL_RE);
  const firstUrl = text.match(URL_RE)?.[0] ?? null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be unavailable — ignore
    }
  }

  return (
    <div>
      <div className="whitespace-pre-wrap break-words rounded-2xl border border-brand-100 bg-brand-50/50 p-4 text-sm text-brand-900">
        {parts.map((p, i) =>
          /^https?:\/\//.test(p) ? (
            <a
              key={i}
              href={p}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
            >
              {p}
            </a>
          ) : (
            <span key={i}>{p}</span>
          ),
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {firstUrl && (
          <a
            href={firstUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-block"
          >
            {t("receiptOpenLink")}
          </a>
        )}
        <button type="button" onClick={copy} className="btn-secondary">
          {copied ? t("receiptCopied") : t("receiptCopy")}
        </button>
      </div>
    </div>
  );
}
