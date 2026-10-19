"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { cleanName, MAX_NAME, MAX_SETS } from "@/lib/alert-sets";
import { SetEditor } from "@/components/features/SetEditor";
import { CreateSetDialog } from "@/components/features/CreateSetDialog";
import {
  AutoSaveInput,
  FileThumb,
  fetchLibrary,
  removeFile,
  uploadFile,
  useFileLabel,
  useUploadError,
  type LibFile,
  type LibraryData,
} from "@/components/features/LibraryBits";

/**
 * The library ("คลังเสียงและรูป"): every file under "ไฟล์ทั้งหมด", and one tab
 * per sound set. The active set drives normal alerts and the sounds fans may
 * pick; "+ สร้างชุด" opens the two-step create-set window.
 */
export function LibraryPage() {
  const t = useTranslations("featureHub");
  const locale = useLocale();
  const label = useFileLabel();
  const uploadError = useUploadError();
  const [data, setData] = useState<LibraryData | null>(null);
  const [tab, setTab] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<LibFile | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await fetchLibrary();
    setData(d);
    return d;
  }

  useEffect(() => {
    fetchLibrary()
      .then(setData)
      .catch(() => setData({ files: [], tiers: [], sets: [], activeSetId: "" }));
  }, []);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const up = await uploadFile(file, true);
      if (!up.ok) setError(uploadError(up.error));
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      await removeFile(removing);
      setRemoving(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function rename(f: LibFile, next: string) {
    if (!cleanName(next)) return false;
    const fd = new FormData();
    fd.append("kind", "libraryName");
    fd.append("assetId", f.id);
    fd.append("name", next);
    const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
    return res.ok;
  }

  if (!data) return null;

  const tiersUsing = (url: string) =>
    data.tiers.filter((x) => x.soundUrl === url || x.imageUrl === url || x.videoUrl === url).map((x) => x.minAmount);
  const setsWith = (id: string) => data.sets.filter((s) => s.items.some((i) => i.assetId === id));
  const currentSet = data.sets.find((s) => s.id === tab) ?? null;
  const tabClass = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
      on ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-800 hover:bg-brand-200"
    }`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-900">{t("libTitle")}</h1>
        <p className="mt-1 text-sm text-brand-900/65">{t("libDesc")}</p>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label={t("libTitle")}>
        <button type="button" onClick={() => setTab("all")} className={tabClass(tab === "all")}>
          {t("libTabAll")}
        </button>
        {data.sets.map((s) => (
          <button key={s.id} type="button" onClick={() => setTab(s.id)} className={tabClass(tab === s.id)}>
            {s.name}
            {s.id === data.activeSetId && (
              <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">{t("setInUse")}</span>
            )}
          </button>
        ))}
        {data.sets.length < MAX_SETS ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full border border-dashed border-brand-400 px-3.5 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            {t("libNewSet")}
          </button>
        ) : (
          <span className="self-center text-xs text-brand-900/55">{t("setTooMany")}</span>
        )}
      </nav>

      {currentSet ? (
        <SetEditor
          key={currentSet.id}
          set={currentSet}
          files={data.files}
          active={currentSet.id === data.activeSetId}
          onChanged={async () => {
            const d = await load();
            if (!d.sets.some((s) => s.id === currentSet.id)) setTab("all");
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-brand-900/55">{t("libLimits")}</p>
            <label className="btn-primary cursor-pointer px-4 py-2 text-sm">
              <Icon name="upload" className="h-4 w-4" />
              {uploading ? t("libUploading") : t("libUpload")}
              <input
                type="file"
                accept="audio/*,image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void upload(f);
                }}
              />
            </label>
          </div>
          <p className="text-xs text-brand-900/55">{t("libUploadHint")}</p>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          {data.files.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-brand-300 p-6 text-center text-sm text-brand-900/60">
              {t("libEmpty")}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.files.map((f) => {
                const tierMins = tiersUsing(f.url);
                const inSets = setsWith(f.id);
                return (
                  <li key={f.id} className="flex flex-col gap-2.5 rounded-2xl border border-brand-200 p-3">
                    <FileThumb file={f} label={label(f)} />
                    {/* Rename in place — sounds show this name to fans when they pick. */}
                    <label className="block">
                      <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-brand-900/70">
                        <Icon name="pencil" className="h-3.5 w-3.5" />
                        {t("libRenameLabel")}
                      </span>
                      <AutoSaveInput
                        value={f.name ?? ""}
                        placeholder={label(f)}
                        ariaLabel={t("libNameLabel")}
                        maxLength={MAX_NAME}
                        save={(next) => rename(f, next)}
                      />
                      {f.kind === "sound" && (
                        <span className="mt-1 block text-xs text-brand-900/50">{t("libRenameHint")}</span>
                      )}
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {inSets.map((s) => (
                        <span key={s.id} className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                          {s.name}
                        </span>
                      ))}
                      {tierMins.map((min) => (
                        <span key={min} className="rounded-full bg-tip-100 px-2 py-0.5 text-xs font-semibold text-tip-700">
                          {t("libUsedIn", { amount: min.toLocaleString() })}
                        </span>
                      ))}
                      {inSets.length === 0 && tierMins.length === 0 && (
                        <span className="text-xs text-brand-900/50">{t("libUnused")}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setRemoving(f)}
                      className="mt-auto self-start text-xs font-semibold text-red-600 hover:underline"
                    >
                      {t("libRemove")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-xs text-brand-900/55">
            {t("libTierHint")} ·{" "}
            <Link href={`/${locale}/dashboard/features/alerts`} className="font-semibold text-brand-700 hover:underline">
              {t("libTierLink")}
            </Link>
          </p>
        </>
      )}

      {creating && (
        <CreateSetDialog
          files={data.files}
          sets={data.sets}
          onClose={() => setCreating(false)}
          reload={async () => (await load()).files}
          onCreated={async (id) => {
            await load();
            setCreating(false);
            setTab(id);
          }}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        message={removing && tiersUsing(removing.url).length > 0 ? t("libRemoveUsed") : t("libRemoveConfirm")}
        confirmLabel={t("libRemove")}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
