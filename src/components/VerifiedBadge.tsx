"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * TipTang's own scalloped star with a tick, in brand pink — drawn here, not a
 * stock icon, and pink so it isn't mistaken for a platform's blue tick.
 * Sized 1em so it matches the text it sits next to.
 */
export function BadgeStar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" className={className}>
      <path
        d="M12 1.2l2.3 2.2 3.1-.6.9 3 3 .9-.6 3.1 2.2 2.3-2.2 2.3.6 3.1-3 .9-.9 3-3.1-.6-2.3 2.2-2.3-2.2-3.1.6-.9-3-3-.9.6-3.1L1.2 12l2.2-2.3-.6-3.1 3-.9.9-3 3.1.6z"
        fill="#e8467f"
      />
      <path d="M7.4 12.3l3.1 3.1 6.1-6.6" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The badge after the creator's name on the donate page. No text on the page;
 * tapping it says which channel was verified, with a link to it.
 */
export function VerifiedBadge({ label, url }: { label: string; url: string }) {
  const t = useTranslations("channelVerify");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={box} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={t("badgeLabel")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <BadgeStar />
      </button>
      {open && (
        <span
          role="tooltip"
          className="card absolute left-1/2 top-full z-20 mt-2 w-60 -translate-x-1/2 rounded-xl p-3 text-left text-sm font-normal text-brand-900 shadow-lg"
        >
          <span className="flex items-start gap-2">
            <BadgeStar className="mt-0.5 shrink-0 text-base" />
            <span>{t("badgeText", { platform: label })}</span>
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block font-semibold text-brand-600 underline"
          >
            {t("badgeOpen")}
          </a>
        </span>
      )}
    </span>
  );
}
