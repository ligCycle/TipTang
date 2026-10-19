"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { MAX_TIERS, MIN_DURATION_SEC, MAX_DURATION_SEC, type AlertTier } from "@/lib/alert-tiers";
import type { OverlayConfig } from "@/components/OverlaySettings";

const DURATIONS = [3, 5, 7, 10, 15, 20, 30, 45, 60].filter(
  (n) => n >= MIN_DURATION_SEC && n <= MAX_DURATION_SEC,
);

const SAVE_DELAY_MS = 800;

type Row = { minAmount: string; soundUrl: string; visual: string; durationSec: string; celebrate: boolean };

const toRow = (t: AlertTier): Row => ({
  minAmount: String(t.minAmount),
  soundUrl: t.soundUrl ?? "",
  visual: t.videoUrl ? `v:${t.videoUrl}` : t.imageUrl ? `i:${t.imageUrl}` : "",
  durationSec: t.durationSec ? String(t.durationSec) : "",
  celebrate: t.celebrate,
});

const toTier = (r: Row): AlertTier => ({
  minAmount: Number(r.minAmount),
  soundUrl: r.soundUrl || null,
  imageUrl: r.visual.startsWith("i:") ? r.visual.slice(2) : null,
  videoUrl: r.visual.startsWith("v:") ? r.visual.slice(2) : null,
  durationSec: r.durationSec ? Number(r.durationSec) : null,
  celebrate: r.celebrate,
});

/**
 * Section ⑤ on the alerts page: up to MAX_TIERS amount thresholds, each
 * overriding sound / visual / time on screen with files from the library.
 * Saved tiers are reported up so the preview can show them.
 */
export function AlertTiersSection({
  config,
  onSaved,
  reload,
}: {
  config: OverlayConfig;
  onSaved: (tiers: AlertTier[]) => void;
  /** Reloads the config after a file is uploaded into the library here. */
  reload: () => Promise<void>;
}) {
  const t = useTranslations("featureHub");
  const locale = useLocale();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  // Latest rows, for code that resumes after an await (upload → select).
  // Kept in step by the load and by change().
  const rowsRef = useRef<Row[]>([]);

  useEffect(() => {
    fetch("/api/overlay/tiers")
      .then((r) => r.json())
      .then((d) => {
        const tiers: AlertTier[] = d.tiers ?? [];
        rowsRef.current = tiers.map(toRow);
        setRows(rowsRef.current);
        onSaved(tiers);
      })
      .catch(() => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!rows) return null;

  // Every change saves by itself shortly after — once each row has an amount
  // (a just-added empty row waits instead of showing an error).
  function change(next: Row[]) {
    rowsRef.current = next;
    setRows(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (next.some((r) => !r.minAmount.trim())) {
      setMessage({ ok: false, text: t("tierNeedAmount") });
      return;
    }
    setMessage(null);
    saveTimer.current = setTimeout(() => void save(next), SAVE_DELAY_MS);
  }

  const update = (i: number, patch: Partial<Row>) =>
    change(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save(rows: Row[]) {
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
      // Rows stay as typed (no re-sorting under the cursor); the preview
      // gets the saved, sorted tiers.
      onSaved(d.tiers);
      setMessage({ ok: true, text: t("tierSaved") });
    } finally {
      setSaving(false);
    }
  }

  // Upload a file into the library right from a tier row, then pick it there.
  async function upload(i: number, slot: "sound" | "visual", file: File) {
    const kind =
      slot === "sound" ? "librarySound" : file.type.startsWith("video/") ? "libraryVideo" : "librarySticker";
    setUploading(`${i}-${slot}`);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      fd.append("file", file);
      fd.append("inRandom", "0"); // for this tier only, not every alert
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || typeof d.url !== "string") {
        const key = `tierUpErr_${d.error}`;
        setMessage({ ok: false, text: t.has(key) ? t(key) : t("tierUpErr") });
        return;
      }
      await reload();
      const patch: Partial<Row> =
        slot === "sound" ? { soundUrl: d.url } : { visual: `${kind === "libraryVideo" ? "v" : "i"}:${d.url}` };
      change(rowsRef.current.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    } finally {
      setUploading(null);
    }
  }

  const selectClass = "input py-1.5 text-sm";
  const uploadButton = (i: number, slot: "sound" | "visual", accept: string) => (
    <label className="btn-secondary shrink-0 cursor-pointer px-3 py-1.5 text-xs">
      {uploading === `${i}-${slot}` ? t("tierUploading") : t("tierUpload")}
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={uploading !== null}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(i, slot, file);
        }}
      />
    </label>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-900/65">{t("tiersIntro")}</p>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-3 rounded-xl border border-brand-200 p-3">
          <label className="text-xs font-semibold text-brand-900/70">
            {t("tierFrom")}
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={r.minAmount}
              onChange={(e) => update(i, { minAmount: e.target.value })}
              className="input mt-1 w-40! py-1.5 text-sm"
            />
          </label>
          <div className="text-xs font-semibold text-brand-900/70">
            {t("tierSound")}
            <div className="mt-1 flex items-center gap-2">
            <select aria-label={t("tierSound")} value={r.soundUrl} onChange={(e) => update(i, { soundUrl: e.target.value })} className={`${selectClass} min-w-0 flex-1`}>
              <option value="">{t("tierNormal")}</option>
              {config.librarySounds.map((s, n) => (
                <option key={s.id} value={s.url}>{t("tierSoundN", { n: n + 1 })}</option>
              ))}
            </select>
            {uploadButton(i, "sound", "audio/*")}
            </div>
          </div>
          <div className="text-xs font-semibold text-brand-900/70">
            {t("tierVisual")}
            <div className="mt-1 flex items-center gap-2">
            <select aria-label={t("tierVisual")} value={r.visual} onChange={(e) => update(i, { visual: e.target.value })} className={`${selectClass} min-w-0 flex-1`}>
              <option value="">{t("tierNormal")}</option>
              {config.libraryStickers.map((s, n) => (
                <option key={s.id} value={`i:${s.url}`}>{t("tierImageN", { n: n + 1 })}</option>
              ))}
              {config.libraryVideos.map((s, n) => (
                <option key={s.id} value={`v:${s.url}`}>{t("tierVideoN", { n: n + 1 })}</option>
              ))}
            </select>
            {uploadButton(i, "visual", "image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm")}
            </div>
          </div>
          <label className="text-xs font-semibold text-brand-900/70">
            {t("tierDuration")}
            <select value={r.durationSec} onChange={(e) => update(i, { durationSec: e.target.value })} className={`${selectClass} mt-1`}>
              <option value="">{t("tierNormal")}</option>
              {/* Keep a saved value that is not in the list instead of showing it as "normal". */}
              {(r.durationSec && !DURATIONS.includes(Number(r.durationSec))
                ? [...DURATIONS, Number(r.durationSec)].sort((a, b) => a - b)
                : DURATIONS
              ).map((n) => (
                <option key={n} value={String(n)}>{t("tierSeconds", { n })}</option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-tip-100/60 px-3 py-2">
            <input
              type="checkbox"
              checked={r.celebrate}
              onChange={(e) => update(i, { celebrate: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-brand-600"
            />
            <span>
              <span className="block text-sm font-semibold text-brand-900">{t("tierCelebrate")}</span>
              <span className="block text-xs text-brand-900/60">{t("tierCelebrateHint")}</span>
            </span>
          </label>
          <div>
            <button
              type="button"
              onClick={() => change(rows.filter((_, j) => j !== i))}
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
            onClick={() => change([...rows, { minAmount: "", soundUrl: "", visual: "", durationSec: "", celebrate: false }])}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            {t("tierAdd")}
          </button>
        ) : (
          <span className="text-xs text-brand-900/55">{t("tierMax", { max: MAX_TIERS })}</span>
        )}
        <span
          className={`text-sm font-medium ${message && !message.ok ? "text-red-600" : "text-brand-900/55"}`}
          aria-live="polite"
        >
          {saving ? t("tierSaving") : message ? message.text : null}
        </span>
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
