"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

type Config = {
  url: string;
  soundUrl: string | null;
  imageUrl: string | null;
};

export function OverlaySettings() {
  const t = useTranslations("dashboard");
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState<"sound" | "image" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function reveal() {
    setLoading(true);
    try {
      const res = await fetch("/api/overlay/setup", { method: "POST" });
      const d = await res.json();
      if (res.ok && d.key) {
        setConfig({
          url: `${window.location.origin}/overlay/${d.username}?key=${d.key}`,
          soundUrl: d.soundUrl ?? null,
          imageUrl: d.imageUrl ?? null,
        });
      }
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!config) return;
    try {
      await navigator.clipboard.writeText(config.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  async function uploadAsset(
    kind: "sound" | "image",
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(kind);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", file);
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(t("obsAssetError"));
        return;
      }
      setConfig((c) =>
        c ? { ...c, [kind === "sound" ? "soundUrl" : "imageUrl"]: d.url } : c,
      );
    } finally {
      setUploading(null);
    }
  }

  async function removeAsset(kind: "sound" | "image") {
    setUploading(kind);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("remove", "1");
      await fetch("/api/overlay/asset", { method: "POST", body: fd });
      setConfig((c) =>
        c ? { ...c, [kind === "sound" ? "soundUrl" : "imageUrl"]: null } : c,
      );
    } finally {
      setUploading(null);
    }
  }

  function testSound() {
    if (config?.soundUrl) {
      audioRef.current = new Audio(config.soundUrl);
      audioRef.current.play().catch(() => {});
    }
  }

  return (
    <div className="card rounded-2xl p-5">
      <h2 className="text-lg font-bold text-brand-900">🔴 {t("obsTitle")}</h2>
      <p className="mt-1 text-sm text-brand-900/65">{t("obsDesc")}</p>

      {!config ? (
        <button onClick={reveal} disabled={loading} className="btn-secondary mt-4">
          {loading ? "…" : t("obsReveal")}
        </button>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Overlay URL */}
          <div>
            <p className="mb-1 text-sm font-medium text-brand-900/70">
              {t("obsUrlLabel")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={config.url}
                onFocus={(e) => e.currentTarget.select()}
                className="input flex-1 text-xs"
              />
              <button onClick={copy} className="btn-secondary shrink-0 px-4 py-2 text-sm">
                {copied ? t("copied") : t("copyLink")}
              </button>
              <a
                href={`${config.url}&test=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                {t("obsPreview")}
              </a>
            </div>
            <p className="mt-1 text-xs text-brand-900/55">{t("obsHint")}</p>
          </div>

          {/* Customize alert */}
          <div className="border-t border-brand-900/10 pt-4">
            <p className="mb-3 text-sm font-semibold text-brand-900/80">
              {t("obsCustomize")}
            </p>

            {/* Image / GIF */}
            <div className="mb-4">
              <div className="mb-1 flex items-center gap-3">
                <span className="text-sm text-brand-900/70">{t("obsImage")}</span>
                {config.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={config.imageUrl}
                    alt=""
                    className="h-10 w-10 rounded object-cover"
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn-secondary cursor-pointer px-4 py-1.5 text-sm">
                  {uploading === "image"
                    ? t("obsUploading")
                    : config.imageUrl
                      ? t("obsChange")
                      : t("obsUpload")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => uploadAsset("image", e)}
                    className="hidden"
                  />
                </label>
                {config.imageUrl && (
                  <button
                    onClick={() => removeAsset("image")}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    {t("obsRemove")}
                  </button>
                )}
                <span className="text-xs text-brand-900/50">{t("obsImageHint")}</span>
              </div>
            </div>

            {/* Sound */}
            <div>
              <span className="mb-1 block text-sm text-brand-900/70">
                {t("obsSound")}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn-secondary cursor-pointer px-4 py-1.5 text-sm">
                  {uploading === "sound"
                    ? t("obsUploading")
                    : config.soundUrl
                      ? t("obsChange")
                      : t("obsUpload")}
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm"
                    onChange={(e) => uploadAsset("sound", e)}
                    className="hidden"
                  />
                </label>
                {config.soundUrl && (
                  <>
                    <button
                      onClick={testSound}
                      className="rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200"
                    >
                      ▶ {t("obsTestSound")}
                    </button>
                    <button
                      onClick={() => removeAsset("sound")}
                      className="text-sm font-medium text-red-600 hover:underline"
                    >
                      {t("obsRemove")}
                    </button>
                  </>
                )}
                <span className="text-xs text-brand-900/50">{t("obsSoundHint")}</span>
              </div>
            </div>

            {error && (
              <p className="mt-2 text-sm font-medium text-red-600">{error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
