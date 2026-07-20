"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type Kind = "sound" | "image" | "video";
type Config = {
  url: string;
  soundUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  color: string | null;
};

const DEFAULT_COLOR = "#ec4899";

const FIELD: Record<Kind, keyof Config> = {
  sound: "soundUrl",
  image: "imageUrl",
  video: "videoUrl",
};

export function OverlaySettings() {
  const t = useTranslations("dashboard");
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hexInput, setHexInput] = useState(DEFAULT_COLOR);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Keep the hex text field in sync when the color changes elsewhere (picker,
  // reset, or first load).
  useEffect(() => {
    setHexInput(config?.color ?? DEFAULT_COLOR);
  }, [config?.color]);

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
          videoUrl: d.videoUrl ?? null,
          color: d.color ?? null,
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

  async function uploadAsset(kind: Kind, e: React.ChangeEvent<HTMLInputElement>) {
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
      setConfig((c) => (c ? { ...c, [FIELD[kind]]: d.url } : c));
    } finally {
      setUploading(null);
    }
  }

  async function removeAsset(kind: Kind) {
    setUploading(kind);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("remove", "1");
      await fetch("/api/overlay/asset", { method: "POST", body: fd });
      setConfig((c) => (c ? { ...c, [FIELD[kind]]: null } : c));
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

  // Persist the chosen color. Debounced by the browser's color input (fires on
  // change/commit, not every drag frame).
  async function saveColor(color: string) {
    setConfig((c) => (c ? { ...c, color } : c));
    const fd = new FormData();
    fd.set("kind", "color");
    fd.set("color", color);
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
  }

  // Typed/pasted hex code. Auto-prefix "#", keep partial input in the field,
  // and only persist once it's a valid 6-digit hex.
  function onHexChange(raw: string) {
    let v = raw.trim();
    if (v && !v.startsWith("#")) v = "#" + v;
    v = v.slice(0, 7);
    setHexInput(v);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) saveColor(v.toLowerCase());
  }

  async function resetColor() {
    setConfig((c) => (c ? { ...c, color: null } : c));
    const fd = new FormData();
    fd.set("kind", "color");
    fd.set("remove", "1");
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
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
          <div className="space-y-4 border-t border-brand-900/10 pt-4">
            <p className="text-sm font-semibold text-brand-900/80">
              {t("obsCustomize")}
            </p>

            {/* Alert card color */}
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <span className="text-sm text-brand-900/70">🎨 {t("obsColor")}</span>
                <input
                  type="color"
                  value={config.color ?? DEFAULT_COLOR}
                  onChange={(e) => saveColor(e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border border-brand-200 bg-transparent p-0.5"
                  aria-label={t("obsColor")}
                />
                <input
                  type="text"
                  value={hexInput}
                  onChange={(e) => onHexChange(e.target.value)}
                  placeholder={DEFAULT_COLOR}
                  spellCheck={false}
                  maxLength={7}
                  className="input w-28 font-mono text-sm uppercase"
                  aria-label={t("obsColorCode")}
                />
                {!config.color && (
                  <span className="text-xs text-brand-900/45">
                    ({t("obsColorDefault")})
                  </span>
                )}
                {config.color && (
                  <button
                    onClick={resetColor}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    {t("obsColorReset")}
                  </button>
                )}
              </div>
              {/* Live preview of the alert card */}
              <div
                className="w-full max-w-xs rounded-2xl p-4 text-white shadow-lg ring-1 ring-white/20"
                style={{
                  backgroundImage: `linear-gradient(to bottom right, ${
                    config.color ?? DEFAULT_COLOR
                  }, color-mix(in srgb, ${
                    config.color ?? DEFAULT_COLOR
                  }, black 30%))`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-extrabold drop-shadow">
                    💸 {t("obsPreviewName")}
                  </span>
                  <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-sm font-black">
                    ฿100
                  </span>
                </div>
                <p className="mt-1 text-xs text-white/95">{t("obsPreviewMsg")}</p>
              </div>
            </div>

            {/* Video (takes priority) */}
            <div className="rounded-xl bg-brand-50 p-3">
              <div className="mb-1 flex items-center gap-3">
                <span className="text-sm font-medium text-brand-900/80">
                  🎬 {t("obsVideo")}
                </span>
                {config.videoUrl && (
                  <video
                    src={config.videoUrl}
                    muted
                    className="h-10 w-16 rounded object-cover"
                  />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn-secondary cursor-pointer px-4 py-1.5 text-sm">
                  {uploading === "video"
                    ? t("obsUploading")
                    : config.videoUrl
                      ? t("obsChange")
                      : t("obsUpload")}
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    onChange={(e) => uploadAsset("video", e)}
                    className="hidden"
                  />
                </label>
                {config.videoUrl && (
                  <button
                    onClick={() => removeAsset("video")}
                    className="text-sm font-medium text-red-600 hover:underline"
                  >
                    {t("obsRemove")}
                  </button>
                )}
                <span className="text-xs text-brand-900/50">{t("obsVideoHint")}</span>
              </div>
              <p className="mt-1 text-xs text-brand-600">{t("obsVideoNote")}</p>
            </div>

            {/* Image / GIF */}
            <div>
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
              <p className="text-sm font-medium text-red-600">{error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
