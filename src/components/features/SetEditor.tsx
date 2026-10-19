"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/features/FeatureCard";
import { cleanName, cleanPrice } from "@/lib/alert-sets";
import {
  AutoSaveInput,
  FileThumb,
  patchSet,
  uploadFile,
  useFileLabel,
  useUploadError,
  type LibFile,
  type SoundSet,
} from "@/components/features/LibraryBits";

/**
 * One sound set: its files, and for sounds the "fans can pick" switch and
 * the minimum tip. Everything saves by itself.
 */
export function SetEditor({
  set,
  files,
  active,
  onChanged,
}: {
  set: SoundSet;
  files: LibFile[];
  active: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("featureHub");
  const label = useFileLabel();
  const uploadError = useUploadError();
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const byId = new Map(files.map((f) => [f.id, f]));
  const rows = set.items
    .map((i) => ({ item: i, file: byId.get(i.assetId) }))
    .filter((r): r is { item: SoundSet["items"][number]; file: LibFile } => Boolean(r.file));
  const inSet = new Set(set.items.map((i) => i.assetId));
  const notInSet = files.filter((f) => !inSet.has(f.id));
  const sounds = rows.filter((r) => r.file.kind === "sound");
  const noFreeSound = sounds.length > 0 && sounds.every((r) => r.item.minAmount > 0);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const res = await patchSet(set.id, body);
    if (!res.ok) setError(t("setSaveFailed"));
    await onChanged();
    return res.ok;
  }

  async function uploadAndAdd(file: File) {
    setUploading(true);
    setError(null);
    try {
      const up = await uploadFile(file, false);
      if (!up.ok) {
        setError(uploadError(up.error));
        return;
      }
      await patch({ item: { assetId: up.id } });
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/overlay/sets/${set.id}`, { method: "DELETE" });
      if (!res.ok) setError(t("setDeleteActive"));
      setDeleting(false);
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-xs font-semibold text-brand-900/70">
          {t("setNameLabel")}
          <AutoSaveInput
            key={set.id}
            value={set.name}
            ariaLabel={t("setNameLabel")}
            className="mt-1 w-full"
            save={async (next) => (cleanName(next) ? patch({ name: next }) : false)}
          />
        </label>
        {active ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-700">
            <Icon name="check" className="h-4 w-4" />
            {t("setInUse")}
          </span>
        ) : (
          <button type="button" onClick={() => void patch({ activate: true })} className="btn-primary px-4 py-2 text-sm">
            {t("setUse")}
          </button>
        )}
      </div>
      <p className="text-xs text-brand-900/55">{t("setHint")}</p>
      {noFreeSound && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <Icon name="alert-triangle" className="mt-px h-3.5 w-3.5 shrink-0" />
          {t("setNoFreeSound")}
        </p>
      )}
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-300 p-5 text-center text-sm text-brand-900/60">
          {t("setEmpty")}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ item, file }) => (
            <li key={file.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 p-2.5">
              <FileThumb file={file} label={label(file)} small />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-brand-900">{label(file)}</p>
                <p className="text-xs text-brand-900/55">
                  {file.kind === "sound"
                    ? item.fanPickable
                      ? t("setFanPick")
                      : t("setFanPickOff")
                    : file.kind === "video"
                      ? t("setVideoRow")
                      : t("setImageRow")}
                </p>
              </div>
              {/* Controls drop to their own line on phones so the name stays readable. */}
              <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
              {file.kind === "sound" && (
                <>
                  <Switch
                    checked={item.fanPickable}
                    onChange={(next) => void patch({ item: { assetId: file.id, fanPickable: next } })}
                    label={`${t("setFanPick")} ${label(file)}`}
                  />
                  <label className="flex items-center gap-1 text-xs font-semibold text-brand-900/70">
                    ฿
                    <AutoSaveInput
                      key={`${set.id}-${file.id}`}
                      value={item.minAmount > 0 ? String(item.minAmount) : ""}
                      placeholder={t("setFree")}
                      inputMode="numeric"
                      ariaLabel={`${t("setPrice")} ${label(file)}`}
                      className="w-24"
                      save={async (next) => {
                        const price = next.trim() === "" ? 0 : cleanPrice(next);
                        return price === null ? false : patch({ item: { assetId: file.id, minAmount: price } });
                      }}
                    />
                  </label>
                </>
              )}
              <button
                type="button"
                onClick={() => void patch({ removeAssetId: file.id })}
                className="text-xs font-semibold text-red-600 hover:underline"
              >
                {t("setRemoveItem")}
              </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-dashed border-brand-300 p-3">
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          className="text-sm font-semibold text-brand-700 hover:underline"
        >
          {t("setAddFiles")}
        </button>
        {adding && (
          <div className="mt-3 space-y-3">
            {notInSet.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {notInSet.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-lg border border-brand-200 p-2">
                    <FileThumb file={f} label={label(f)} small />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-900">{label(f)}</span>
                    <button
                      type="button"
                      onClick={() => void patch({ item: { assetId: f.id } })}
                      className="btn-secondary px-3 py-1 text-xs"
                    >
                      {t("setAddOne")}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-brand-900/55">{t("setAllIn")}</p>
            )}
            <label className="btn-secondary inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs">
              <Icon name="upload" className="h-3.5 w-3.5" />
              {uploading ? t("libUploading") : t("csUpload")}
              <input
                type="file"
                accept="audio/*,image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadAndAdd(f);
                }}
              />
            </label>
          </div>
        )}
      </div>

      <div className="border-t border-brand-900/10 pt-3">
        <button
          type="button"
          onClick={() => setDeleting(true)}
          disabled={active}
          title={active ? t("setDeleteActive") : undefined}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
        >
          <Icon name="trash" className="h-4 w-4" />
          {t("setDelete")}
        </button>
        {active && <p className="mt-1 text-xs text-brand-900/50">{t("setDeleteActive")}</p>}
      </div>

      <ConfirmDialog
        open={deleting}
        message={t("setDeleteConfirm", { name: set.name })}
        confirmLabel={t("setDelete")}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDeleting(false)}
      />
    </div>
  );
}
