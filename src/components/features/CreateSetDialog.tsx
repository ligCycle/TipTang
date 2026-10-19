"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { Switch } from "@/components/features/FeatureCard";
import { cleanName, cleanPrice, MAX_NAME } from "@/lib/alert-sets";
import {
  FileThumb,
  uploadFile,
  useFileLabel,
  useUploadError,
  type FileKind,
  type LibFile,
  type SetItem,
  type SoundSet,
} from "@/components/features/LibraryBits";

type Filter = "all" | FileKind;

/**
 * "+ สร้างชุด": two steps, as in the approved mockup — (1) name, start from
 * empty or a copy, tick files (or upload); (2) which sounds fans may pick and
 * their minimum, then use now or keep for later.
 */
export function CreateSetDialog({
  files,
  sets,
  onClose,
  onCreated,
  reload,
}: {
  files: LibFile[];
  sets: SoundSet[];
  onClose: () => void;
  onCreated: (id: string) => Promise<void>;
  reload: () => Promise<LibFile[]>;
}) {
  const t = useTranslations("featureHub");
  const label = useFileLabel();
  const uploadError = useUploadError();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const [picked, setPicked] = useState<Map<string, SetItem>>(new Map());
  const [filter, setFilter] = useState<Filter>("all");
  const [library, setLibrary] = useState(files);
  const [uploading, setUploading] = useState(false);
  const [useNow, setUseNow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const item = (assetId: string): SetItem => picked.get(assetId) ?? { assetId, fanPickable: true, minAmount: 0 };

  function startFrom(id: string | null) {
    setCopyFrom(id);
    const src = sets.find((s) => s.id === id);
    setPicked(new Map((src?.items ?? []).map((i) => [i.assetId, i])));
  }

  // Functional updates: quick successive clicks each see the latest picks.
  function toggle(f: LibFile) {
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(f.id)) next.delete(f.id);
      else next.set(f.id, { assetId: f.id, fanPickable: true, minAmount: 0 });
      return next;
    });
  }

  function setRow(assetId: string, patch: Partial<SetItem>) {
    setPicked((m) => {
      const base = m.get(assetId) ?? { assetId, fanPickable: true, minAmount: 0 };
      return new Map(m).set(assetId, { ...base, ...patch });
    });
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const up = await uploadFile(file, false);
      if (!up.ok) {
        setError(uploadError(up.error));
        return;
      }
      setLibrary(await reload());
      setPicked((m) => new Map(m).set(up.id, { assetId: up.id, fanPickable: true, minAmount: 0 }));
    } finally {
      setUploading(false);
    }
  }

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/overlay/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, items: [...picked.values()], activate: useNow }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error === "too_many" ? t("setTooMany") : t("setSaveFailed"));
        return;
      }
      await onCreated(d.id);
    } finally {
      setSaving(false);
    }
  }

  const shown = library.filter((f) => filter === "all" || f.kind === filter);
  const pickedSounds = library.filter((f) => f.kind === "sound" && picked.has(f.id));
  const pickedOther = library.filter((f) => f.kind !== "sound" && picked.has(f.id));
  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-semibold transition ${
      on ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-800 hover:bg-brand-200"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="card flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl shadow-2xl">
        <div className="space-y-1 border-b border-brand-900/10 p-5">
          <div className="flex gap-2 text-xs font-semibold">
            <span className={`rounded-full px-2.5 py-0.5 ${step === 1 ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-800"}`}>
              {t("csStep1")}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 ${step === 2 ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-800"}`}>
              {t("csStep2")}
            </span>
          </div>
          <h2 className="text-lg font-extrabold text-brand-900">
            {step === 1 ? t("csTitle") : t("csTitle2", { name })}
          </h2>
          <p className="text-xs text-brand-900/60">{step === 1 ? t("csSub") : t("csStep2Hint")}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {step === 1 ? (
            <>
              <label className="block text-xs font-semibold text-brand-900/70">
                {t("setNameLabel")}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={MAX_NAME}
                  placeholder={t("csNamePh")}
                  className="input mt-1"
                />
              </label>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-brand-900/70">{t("csStartFrom")}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => startFrom(null)} className={chip(copyFrom === null)}>
                    {t("csEmpty")}
                  </button>
                  {sets.map((s) => (
                    <button key={s.id} type="button" onClick={() => startFrom(s.id)} className={chip(copyFrom === s.id)}>
                      {t("csCopy", { name: s.name })}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-brand-900/70">{t("csPick", { n: picked.size })}</p>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {(["all", "sound", "image", "video"] as Filter[]).map((f) => (
                    <button key={f} type="button" onClick={() => setFilter(f)} className={chip(filter === f)}>
                      {t(`csFilter_${f}`)}
                    </button>
                  ))}
                </div>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {shown.map((f) => {
                    const on = picked.has(f.id);
                    return (
                      <li key={f.id}>
                        <div
                          className={`relative rounded-xl border-2 p-2 ${on ? "border-brand-500 bg-brand-50" : "border-brand-200"}`}
                        >
                          <FileThumb file={f} label={label(f)} />
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => toggle(f)}
                            className="mt-1.5 flex w-full items-center gap-1.5 text-left text-xs font-semibold text-brand-900"
                          >
                            <span
                              className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                                on ? "border-brand-600 bg-brand-600 text-white" : "border-brand-300"
                              }`}
                            >
                              {on && <Icon name="check" className="h-3 w-3" />}
                            </span>
                            <span className="truncate">{label(f)}</span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  <li>
                    <label className="flex h-full min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-brand-300 p-2 text-center text-xs font-semibold text-brand-700">
                      <Icon name="upload" className="h-5 w-5" />
                      {uploading ? t("libUploading") : t("csUpload")}
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
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <>
              {pickedSounds.length === 0 ? (
                <p className="text-sm text-brand-900/60">{t("csNoSounds")}</p>
              ) : (
                <ul className="space-y-2">
                  {pickedSounds.map((f) => {
                    const it = item(f.id);
                    return (
                      <li key={f.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 p-2.5">
                        <FileThumb file={f} label={label(f)} small />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-brand-900">{label(f)}</p>
                          <p className="text-xs text-brand-900/55">{it.fanPickable ? t("setFanPick") : t("setFanPickOff")}</p>
                        </div>
                        <Switch
                          checked={it.fanPickable}
                          onChange={(next) => setRow(f.id, { fanPickable: next })}
                          label={`${t("setFanPick")} ${label(f)}`}
                        />
                        <label className="flex items-center gap-1 text-xs font-semibold text-brand-900/70">
                          ฿
                          <input
                            value={it.minAmount > 0 ? String(it.minAmount) : ""}
                            onChange={(e) => {
                              const p = e.target.value.trim() === "" ? 0 : cleanPrice(e.target.value);
                              if (p !== null) setRow(f.id, { minAmount: p });
                            }}
                            inputMode="numeric"
                            placeholder={t("setFree")}
                            aria-label={`${t("setPrice")} ${label(f)}`}
                            className="input w-24! py-1.5 text-sm"
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {pickedOther.length > 0 && (
                <p className="text-xs text-brand-900/55">{t("csVisualNote", { n: pickedOther.length })}</p>
              )}
              <div>
                <p className="mb-1.5 text-xs font-semibold text-brand-900/70">{t("csUseLabel")}</p>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setUseNow(true)} className={chip(useNow)}>
                    {t("csUseNow")}
                  </button>
                  <button type="button" onClick={() => setUseNow(false)} className={chip(!useNow)}>
                    {t("csKeep")}
                  </button>
                </div>
              </div>
            </>
          )}
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-brand-900/10 p-4">
          <button
            type="button"
            onClick={step === 1 ? onClose : () => setStep(1)}
            className="text-sm font-semibold text-brand-900/60 hover:underline"
          >
            {step === 1 ? t("csCancel") : t("csBack")}
          </button>
          {step === 1 ? (
            <button
              type="button"
              disabled={!cleanName(name)}
              onClick={() => setStep(2)}
              className="btn-primary px-5 py-2 text-sm"
            >
              {t("csNext")}
            </button>
          ) : (
            <button type="button" disabled={saving} onClick={() => void create()} className="btn-primary px-5 py-2 text-sm">
              {t("csCreate")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
