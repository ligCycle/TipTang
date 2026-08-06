"use client";

import { useRef, useState } from "react";

// Default accent when the creator hasn't picked a profile color.
const FALLBACK_ACCENT = "#ec4899";

function ReceiptIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * Prominent slip-upload zone: a big dashed drop area you can click OR drag a
 * file onto, with an inline preview + filename once picked. Presentational —
 * the parent validates the File (type/size) and owns the preview URL. The
 * receipt icon + accents follow the creator's `accentColor` (brand pink when
 * unset). No emoji — inline SVG only, so color follows the theme/accent.
 */
export function SlipDropzone({
  previewUrl,
  fileName,
  onFile,
  label,
  hint,
  changeLabel,
  inputRef,
  accentColor,
}: {
  previewUrl: string | null;
  fileName?: string | null;
  onFile: (file: File | null) => void;
  label: string;
  hint: string;
  changeLabel: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  accentColor?: string;
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  const [drag, setDrag] = useState(false);
  const accent = accentColor || FALLBACK_ACCENT;

  // preventDefault + stopPropagation on enter/over too (not just drop) — else
  // the browser navigates away to open the dropped file in a new tab.
  function stop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  return (
    <label
      onDragEnter={(e) => {
        stop(e);
        setDrag(true);
      }}
      onDragOver={(e) => {
        stop(e);
        setDrag(true);
      }}
      onDragLeave={(e) => {
        stop(e);
        setDrag(false);
      }}
      onDrop={(e) => {
        stop(e);
        setDrag(false);
        onFile(e.dataTransfer.files?.[0] ?? null);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
        drag
          ? "bg-brand-50"
          : "border-brand-200 bg-brand-50/50 hover:border-brand-300 hover:bg-brand-50"
      }`}
      style={drag ? { borderColor: accent } : undefined}
    >
      {previewUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="slip preview"
            className="max-h-48 rounded-xl border border-brand-100"
          />
          <span
            className="flex max-w-full items-center gap-1.5 text-sm font-semibold"
            style={{ color: accent }}
          >
            <CheckIcon />
            {fileName && (
              <span className="max-w-[10rem] truncate text-brand-900/60">
                {fileName}
              </span>
            )}
            <span aria-hidden className="text-brand-900/40">
              ·
            </span>
            <span>{changeLabel}</span>
          </span>
        </>
      ) : (
        <>
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{
              backgroundColor: `color-mix(in srgb, ${accent} 15%, transparent)`,
              color: accent,
            }}
          >
            <ReceiptIcon />
          </span>
          <span className="text-sm font-semibold text-brand-900/90">
            {label}
          </span>
          <span className="text-xs text-brand-900/55">{hint}</span>
        </>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
          // Reset so re-picking the SAME file still fires onChange next time.
          e.target.value = "";
        }}
        className="hidden"
      />
    </label>
  );
}
