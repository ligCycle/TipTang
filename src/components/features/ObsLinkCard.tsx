"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { OverlayConnectionStatus } from "@/components/OverlayConnectionStatus";

const OLD_LINKS_HIDDEN_KEY = "tiptang_old_links_note_hidden";

function readHidden(): boolean {
  try {
    return localStorage.getItem(OLD_LINKS_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The single OBS link: copy it once, and every feature that's switched on
 * shows up on stream. Creators who already connected the old per-feature
 * links get a one-time note that those keep working — and that keeping both
 * would play every alert twice.
 */
export function ObsLinkCard({
  liveUrl,
  lastSeenAt,
}: {
  liveUrl: string;
  lastSeenAt: string | null;
}) {
  const t = useTranslations("featureHub");
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const hiddenStored = useSyncExternalStore(
    () => () => {},
    readHidden,
    () => true,
  );
  const showOldNote = lastSeenAt !== null && !hiddenStored && !dismissed;

  async function copy() {
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(OLD_LINKS_HIDDEN_KEY, "1");
    } catch {
      // private mode — the note just comes back next visit
    }
  }

  return (
    <section className="rounded-2xl border-2 border-brand-400 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Icon name="monitor" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-brand-900">{t("obsTitle")}</h2>
          <p className="text-sm text-brand-900/65">{t("obsLine")}</p>
          <p className="text-xs text-brand-900/50">{t("obsSize")}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={liveUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="input min-w-0 flex-1 font-mono text-xs"
          aria-label={t("obsTitle")}
        />
        <button type="button" onClick={copy} className="btn-primary px-4 py-2 text-sm">
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <div className="mt-3">
        <OverlayConnectionStatus initialLastSeenAt={lastSeenAt} />
      </div>
      {showOldNote && (
        <div className="mt-3 flex flex-wrap items-start gap-2 rounded-lg bg-brand-100/60 px-3 py-2 text-xs text-brand-900/75">
          <Icon name="lightbulb" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{t("oldLinksNote")}</span>
          <button type="button" onClick={dismiss} className="font-semibold text-brand-700 hover:underline">
            {t("dismiss")}
          </button>
        </div>
      )}
    </section>
  );
}
