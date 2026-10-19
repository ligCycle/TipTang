"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { MAX_TIERS, MIN_DURATION_SEC, MAX_DURATION_SEC, type AlertTier } from "@/lib/alert-tiers";
import type { OverlayConfig } from "@/components/OverlaySettings";

const DURATIONS = [3, 5, 7, 10, 15, 20, 30, 45, 60].filter(
  (n) => n >= MIN_DURATION_SEC && n <= MAX_DURATION_SEC,
);

type Row = { minAmount: string; soundUrl: string; visual: string; durationSec: string };

const toRow = (t: AlertTier): Row => ({
  minAmount: String(t.minAmount),
  soundUrl: t.soundUrl ?? "",
  visual: t.videoUrl ? `v:${t.videoUrl}` : t.imageUrl ? `i:${t.imageUrl}` : "",
  durationSec: t.durationSec ? String(t.durationSec) : "",
});

const toTier = (r: Row): AlertTier => ({
  minAmount: Number(r.minAmount),
  soundUrl: r.soundUrl || null,
  imageUrl: r.visual.startsWith("i:") ? r.visual.slice(2) : null,
  videoUrl: r.visual.startsWith("v:") ? r.visual.slice(2) : null,
  durationSec: r.durationSec ? Number(r.durationSec) : null,
});

/**
 * Section ④ on the alerts page: up to MAX_TIERS amount thresholds, each
 * overriding sound / visual / time on screen with files from the library.
 * Saved tiers are reported up so the preview can show them.
 */
export function AlertTiersSection({
  config,
  onSaved,
}: {
  config: OverlayConfig;
  onSaved: (tiers: AlertTier[]) => void;
}) {
  const t = useTranslations("featureHub");
  const locale = useLocale();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/overlay/tiers")
      .then((r) => r.json())
      .then((d) => {
        const tiers: AlertTier[] = d.tiers ?? [];
        setRows(tiers.map(toRow));
        onSaved(tiers);
      })
      .catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rows) return null;

  const update = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    if (!rows) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/overlay/tiers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tiers: rows.map(toTier) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const key = `tierErr_${d.error}`;
        setMessage({ ok: false, text: t.has(key) ? t(key) : t("tierErr_invalid") });
        return;
      }
      setRows((d.tiers as AlertTier[]).map(toRow));
      onSaved(d.tiers);
      setMessage({ ok: true, text: t("tierSaved") });
    } finally {
      setSaving(false);
    }
  }

  const selectClass = "input py-1.5 text-sm";

  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-900/65">{t("tiersIntro")}</p>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-brand-200 p-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-brand-900/70">
            {t("tierFrom")}
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={r.minAmount}
              onChange={(e) => update(i, { minAmount: e.target.value })}
              className="input mt-1 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs font-semibold text-brand-900/70">
            {t("tierSound")}
            <select value={r.soundUrl} onChange={(e) => update(i, { soundUrl: e.target.value })} className={`${selectClass} mt-1`}>
              <option value="">{t("tierNormal")}</option>
              {config.librarySounds.map((s, n) => (
                <option key={s.id} value={s.url}>{t("tierSoundN", { n: n + 1 })}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-brand-900/70">
            {t("tierVisual")}
            <select value={r.visual} onChange={(e) => update(i, { visual: e.target.value })} className={`${selectClass} mt-1`}>
              <option value="">{t("tierNormal")}</option>
              {config.libraryStickers.map((s, n) => (
                <option key={s.id} value={`i:${s.url}`}>{t("tierImageN", { n: n + 1 })}</option>
              ))}
              {config.libraryVideos.map((s, n) => (
                <option key={s.id} value={`v:${s.url}`}>{t("tierVideoN", { n: n + 1 })}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-brand-900/70">
            {t("tierDuration")}
            <select value={r.durationSec} onChange={(e) => update(i, { durationSec: e.target.value })} className={`${selectClass} mt-1`}>
              <option value="">{t("tierNormal")}</option>
              {DURATIONS.map((n) => (
                <option key={n} value={String(n)}>{t("tierSeconds", { n })}</option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              {t("tierRemove")}
            </button>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {rows.length < MAX_TIERS ? (
          <button
            type="button"
            onClick={() => setRows([...rows, { minAmount: "", soundUrl: "", visual: "", durationSec: "" }])}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            {t("tierAdd")}
          </button>
        ) : (
          <span className="text-xs text-brand-900/55">{t("tierMax", { max: MAX_TIERS })}</span>
        )}
        <button type="button" onClick={save} disabled={saving} className="btn-primary px-4 py-1.5 text-sm">
          {t("tierSave")}
        </button>
        {message && (
          <span className={`text-sm font-medium ${message.ok ? "text-brand-700" : "text-red-600"}`} aria-live="polite">
            {message.text}
          </span>
        )}
      </div>
      <p className="text-xs text-brand-900/55">
        {t("tierLibraryHint")} ·{" "}
        <Link href={`/${locale}/dashboard/library`} className="font-semibold text-brand-700 hover:underline">
          {t("tierLibraryLink")}
        </Link>
      </p>
    </div>
  );
}
