"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { OverlaySettings, type OverlayConfig } from "@/components/OverlaySettings";

/** Library videos: uploaded here, used only by alert tiers. */
function LibraryVideos({ config, reload }: { config: OverlayConfig; reload: () => Promise<void> }) {
  const t = useTranslations("featureHub");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    setError(false);
    try {
      const fd = new FormData();
      fd.append("kind", "libraryVideo");
      fd.append("file", file);
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      await reload();
    } catch {
      setError(true);
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    const fd = new FormData();
    fd.append("kind", "libraryVideo");
    fd.append("remove", "1");
    fd.append("assetId", id);
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
    await reload();
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-brand-900/80">{t("libVideos")}</p>
        <label className="btn-primary cursor-pointer px-3 py-1.5 text-sm">
          {uploading ? t("libUploading") : t("libUpload")}
          <input
            type="file"
            accept="video/mp4,video/webm"
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
      <p className="mt-1 text-xs text-brand-900/55">{t("libVideosHint")}</p>
      {error && <p className="mt-2 text-sm font-medium text-red-600">{t("libErr")}</p>}
      {config.libraryVideos.length === 0 ? (
        <p className="mt-3 text-sm text-brand-900/50">{t("libEmpty")}</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {config.libraryVideos.map((v) => (
            <li key={v.id} className="space-y-1">
              <video src={v.url} controls preload="metadata" className="max-h-40 w-full rounded-lg bg-black" />
              <button type="button" onClick={() => remove(v.id)} className="text-xs font-semibold text-red-600 hover:underline">
                {t("libRemove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LibraryPage() {
  const t = useTranslations("featureHub");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-brand-900">{t("libTitle")}</h1>
        <p className="mt-1 text-sm text-brand-900/65">{t("libDesc")}</p>
      </div>
      <OverlaySettings
        view="library"
        videosSlot={(config, reload) => <LibraryVideos config={config} reload={reload} />}
      />
    </div>
  );
}
