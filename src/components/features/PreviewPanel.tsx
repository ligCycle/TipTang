"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * Every feature page's body: the preview on the left (kept in view while the
 * settings scroll, on wide screens), the numbered settings on the right. On
 * phones the preview comes first. Same columns as the alerts page.
 */
export function FeaturePreviewLayout({ preview, children }: { preview: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      <aside className="space-y-3 lg:sticky lg:top-4">{preview}</aside>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}

/**
 * "พรีวิว": what the OBS link shows, drawn at its real width and scaled down
 * to fit the column (never up), on the same dark stage as the alerts preview.
 */
export function PreviewStage({
  width,
  children,
  note,
  controls,
}: {
  /**
   * The width the overlay is laid out at, in px. Fluid overlays (combo, PK,
   * boss) use PREVIEW_WIDTH so their text stays readable; only what's left
   * wider is scaled down to the column.
   */
  width: number;
  children: ReactNode;
  /** One line under the stage. */
  note?: ReactNode;
  /** Buttons under the stage (sample switches). */
  controls?: ReactNode;
}) {
  const t = useTranslations("featureHub");
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () =>
      setBox((cur) => (cur.w === o.clientWidth && cur.h === i.offsetHeight ? cur : { w: o.clientWidth, h: i.offsetHeight }));
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    // ResizeObserver can skip the first size (a tab in the background): measure once more.
    const first = setTimeout(measure, 0);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      clearTimeout(first);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const scale = box.w > 0 ? Math.min(1, box.w / width) : 1;
  const left = box.w > 0 ? Math.max(0, (box.w - width * scale) / 2) : 0;
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-brand-900">{t("previewTitle")}</p>
      <div className="rounded-2xl bg-[#0b1220] p-3">
        <div ref={outer} className="overflow-hidden" style={{ height: box.h ? box.h * scale : undefined }}>
          <div
            ref={inner}
            className="pointer-events-none"
            style={{ width, transform: `translateX(${left}px) scale(${scale})`, transformOrigin: "top left" }}
          >
            {children}
          </div>
        </div>
      </div>
      {controls && <div className="flex flex-wrap gap-2">{controls}</div>}
      {note && <p className="text-xs text-brand-900/55">{note}</p>}
    </div>
  );
}

/** Layout width for fluid overlays: about one column, so scaling stays small. */
export const PREVIEW_WIDTH = 420;

/** A small pill that switches between preview samples. */
export function SampleButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
        on ? "border-tip-500 bg-tip-50 text-tip-700" : "border-brand-200 text-brand-900/70"
      }`}
    >
      {children}
    </button>
  );
}
