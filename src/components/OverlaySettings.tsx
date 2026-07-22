"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ColorField } from "./ColorField";
import { DEFAULT_COLOR, PRESET_COLORS } from "@/lib/colors";

type Kind = "sound" | "image" | "video";
type LibItem = { id: string; url: string };
type Config = {
  url: string;
  soundUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  color: string | null;
  ttsEnabled: boolean;
  hasGoal: boolean;
  goalEnabled: boolean;
  goalTitle: string;
  goalAmount: string;
  goalColor: string | null;
  librarySounds: LibItem[];
  libraryStickers: LibItem[];
  timerEnabled: boolean;
  timerBahtPerUnit: number;
  timerSecondsPerUnit: number;
  timerInitialSeconds: number;
  timerMaxSeconds: number | null;
  timerState: "running" | "paused" | "stopped";
  timerColor: string | null;
};

// Format seconds as H:MM:SS (or MM:SS under an hour).
function fmtDuration(total: number): string {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}


const FIELD: Record<Kind, keyof Config> = {
  sound: "soundUrl",
  image: "imageUrl",
  video: "videoUrl",
};

export function OverlaySettings() {
  const t = useTranslations("dashboard");
  const [config, setConfig] = useState<Config | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<"alert" | "goal" | "timer" | null>(null);
  const [uploading, setUploading] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalSaved, setGoalSaved] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalRefresh, setGoalRefresh] = useState(0);
  const [libUploading, setLibUploading] = useState<"sound" | "sticker" | null>(
    null,
  );
  // Subathon timer config inputs (kept in minutes for the UI).
  const [tBaht, setTBaht] = useState("10");
  const [tMin, setTMin] = useState("1");
  const [tInit, setTInit] = useState("60");
  const [tMax, setTMax] = useState("");
  const [timerSaved, setTimerSaved] = useState(false);
  const [savingTimer, setSavingTimer] = useState(false);
  const [timerDisplay, setTimerDisplay] = useState<number | null>(null);
  // Live-countdown base for the dashboard preview: remaining + when measured.
  const timerBaseRef = useRef<{ rem: number; at: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Tick the dashboard countdown once a second from the last measured base.
  useEffect(() => {
    const iv = setInterval(() => {
      if (!timerBaseRef.current) return; // paused/stopped → keep static value
      const elapsed = (Date.now() - timerBaseRef.current.at) / 1000;
      setTimerDisplay(Math.max(0, Math.round(timerBaseRef.current.rem - elapsed)));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

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
          ttsEnabled: Boolean(d.ttsEnabled),
          hasGoal: Boolean(d.hasGoal),
          goalEnabled: d.goalEnabled !== false,
          goalTitle: d.goalTitle ?? "",
          goalAmount: d.goalAmount ?? "",
          goalColor: d.goalColor ?? null,
          librarySounds: d.librarySounds ?? [],
          libraryStickers: d.libraryStickers ?? [],
          timerEnabled: Boolean(d.timerEnabled),
          timerBahtPerUnit: d.timerBahtPerUnit ?? 10,
          timerSecondsPerUnit: d.timerSecondsPerUnit ?? 60,
          timerInitialSeconds: d.timerInitialSeconds ?? 3600,
          timerMaxSeconds: d.timerMaxSeconds ?? null,
          timerState: (d.timerState as Config["timerState"]) ?? "stopped",
          timerColor: d.timerColor ?? null,
        });
        setGoalTitle(d.goalTitle ?? "");
        setGoalAmount(d.goalAmount ?? "");
        setTBaht(String(d.timerBahtPerUnit ?? 10));
        setTMin(String(Math.round((d.timerSecondsPerUnit ?? 60) / 60)));
        setTInit(String(Math.round((d.timerInitialSeconds ?? 3600) / 60)));
        setTMax(d.timerMaxSeconds ? String(Math.round(d.timerMaxSeconds / 60)) : "");
        if (d.timerState === "running") {
          timerBaseRef.current = { rem: d.timerRemainingSeconds ?? 0, at: Date.now() };
        } else {
          timerBaseRef.current = null;
          setTimerDisplay(d.timerRemainingSeconds ?? 0); // static (paused/stopped)
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, which: "alert" | "goal" | "timer") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  const goalUrl = config ? config.url.replace("?key=", "/goal?key=") : "";
  const timerUrl = config ? config.url.replace("?key=", "/timer?key=") : "";

  async function toggleTimer(enabled: boolean) {
    setConfig((c) => (c ? { ...c, timerEnabled: enabled } : c));
    const fd = new FormData();
    fd.set("kind", "timerToggle");
    fd.set("enabled", enabled ? "1" : "0");
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
  }

  async function saveTimerConfig() {
    setSavingTimer(true);
    try {
      const fd = new FormData();
      fd.set("kind", "timerConfig");
      fd.set("bahtPerUnit", tBaht || "10");
      fd.set("secondsPerUnit", String((Number(tMin) || 1) * 60));
      fd.set("initialSeconds", String((Number(tInit) || 0) * 60));
      fd.set("maxSeconds", tMax ? String((Number(tMax) || 0) * 60) : "");
      // Persist the staged clock color in the same request ("" = use alert color).
      fd.set("color", config?.timerColor ?? "");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      if (res.ok) {
        setTimerSaved(true);
        setTimeout(() => setTimerSaved(false), 1500);
        // If the timer is idle (stopped), reflect the new starting time now.
        if (config?.timerState === "stopped") {
          timerBaseRef.current = null;
          setTimerDisplay((Number(tInit) || 0) * 60);
        }
      }
    } finally {
      setSavingTimer(false);
    }
  }

  async function timerControl(control: "start" | "pause" | "reset") {
    const fd = new FormData();
    fd.set("kind", "timerControl");
    fd.set("control", control);
    const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const state = d.state as Config["timerState"];
    setConfig((c) => (c ? { ...c, timerState: state } : c));
    if (state === "running") {
      timerBaseRef.current = { rem: d.remainingSeconds ?? 0, at: Date.now() };
    } else {
      timerBaseRef.current = null;
      setTimerDisplay(d.remainingSeconds ?? 0);
    }
  }

  async function saveGoal() {
    setSavingGoal(true);
    try {
      const fd = new FormData();
      fd.set("kind", "goalSet");
      fd.set("title", goalTitle);
      fd.set("amount", goalAmount || "0");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfig((c) =>
          c
            ? {
                ...c,
                goalTitle,
                goalAmount: goalAmount,
                hasGoal: Boolean(d.hasGoal),
              }
            : c,
        );
        setGoalRefresh((n) => n + 1); // reload the preview iframe
        setGoalSaved(true);
        setTimeout(() => setGoalSaved(false), 1500);
      }
    } finally {
      setSavingGoal(false);
    }
  }

  async function toggleTts(enabled: boolean) {
    setConfig((c) => (c ? { ...c, ttsEnabled: enabled } : c));
    const fd = new FormData();
    fd.set("kind", "ttsToggle");
    fd.set("enabled", enabled ? "1" : "0");
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
  }

  function testTts() {
    const text = "ผู้สนับสนุนตัวอย่าง ทิป 100 บาท ทดสอบเสียงอ่านโดเนต";
    try {
      const tts = new Audio(`/api/tts?lang=th&text=${encodeURIComponent(text)}`);
      tts.play().catch(() => {});
    } catch {
      // ignore
    }
  }

  async function toggleGoal(enabled: boolean) {
    setConfig((c) => (c ? { ...c, goalEnabled: enabled } : c));
    const fd = new FormData();
    fd.set("kind", "goalToggle");
    fd.set("enabled", enabled ? "1" : "0");
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
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

  function playSound(u: string) {
    audioRef.current = new Audio(u);
    audioRef.current.play().catch(() => {});
  }

  // Random-alert library (many sounds/stickers → overlay picks one per alert).
  async function addLibrary(
    kind: "sound" | "sticker",
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setLibUploading(kind);
    try {
      const fd = new FormData();
      fd.set("kind", kind === "sound" ? "librarySound" : "librarySticker");
      fd.set("file", file);
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.id) {
        setError(t("obsAssetError"));
        return;
      }
      setConfig((c) =>
        c
          ? {
              ...c,
              ...(kind === "sound"
                ? { librarySounds: [...c.librarySounds, { id: d.id, url: d.url }] }
                : {
                    libraryStickers: [
                      ...c.libraryStickers,
                      { id: d.id, url: d.url },
                    ],
                  }),
            }
          : c,
      );
    } finally {
      setLibUploading(null);
    }
  }

  async function removeLibrary(kind: "sound" | "sticker", id: string) {
    const fd = new FormData();
    fd.set("kind", kind === "sound" ? "librarySound" : "librarySticker");
    fd.set("remove", "1");
    fd.set("assetId", id);
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
    setConfig((c) =>
      c
        ? {
            ...c,
            ...(kind === "sound"
              ? { librarySounds: c.librarySounds.filter((a) => a.id !== id) }
              : {
                  libraryStickers: c.libraryStickers.filter((a) => a.id !== id),
                }),
          }
        : c,
    );
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

  async function resetColor() {
    setConfig((c) => (c ? { ...c, color: null } : c));
    const fd = new FormData();
    fd.set("kind", "color");
    fd.set("remove", "1");
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
  }

  // Goal-bar color — same shape, persisted under kind=goalColor; refresh the
  // embedded preview so the change shows immediately.
  async function saveGoalColor(color: string) {
    setConfig((c) => (c ? { ...c, goalColor: color } : c));
    const fd = new FormData();
    fd.set("kind", "goalColor");
    fd.set("color", color);
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
    setGoalRefresh((n) => n + 1);
  }

  async function resetGoalColor() {
    setConfig((c) => (c ? { ...c, goalColor: null } : c));
    const fd = new FormData();
    fd.set("kind", "goalColor");
    fd.set("remove", "1");
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
    setGoalRefresh((n) => n + 1);
  }

  // Subathon-timer clock color — staged locally; persisted by the single
  // "Save settings" button below (saveTimerConfig) so one press saves all.
  function saveTimerColor(color: string) {
    setConfig((c) => (c ? { ...c, timerColor: color } : c));
  }

  function resetTimerColor() {
    setConfig((c) => (c ? { ...c, timerColor: null } : c));
  }

  return (
    <div className="card rounded-2xl p-5">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-lg font-bold text-brand-900">🔴 {t("obsTitle")}</h2>
          {!collapsed && (
            <p className="mt-1 text-sm text-brand-900/65">{t("obsDesc")}</p>
          )}
        </div>
        <span
          className={`shrink-0 text-xl text-brand-900/45 transition-transform ${
            collapsed ? "" : "rotate-180"
          }`}
          aria-hidden
        >
          ⌄
        </span>
      </button>

      {collapsed ? null : !config ? (
        <button onClick={reveal} disabled={loading} className="btn-secondary mt-4">
          {loading ? "…" : t("obsReveal")}
        </button>
      ) : (
        <div className="mt-4 space-y-6">
          {/* ===== Alert card ===== */}
          <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
            <h3 className="text-base font-bold text-brand-900">
              🔔 {t("obsAlertSection")}
            </h3>
            <p className="mb-3 mt-0.5 text-xs text-brand-900/55">
              {t("obsAlertSectionDesc")}
            </p>

            {/* Alert overlay URL */}
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
                <button
                  onClick={() => copy(config.url, "alert")}
                  className="btn-secondary shrink-0 px-4 py-2 text-sm"
                >
                  {copied === "alert" ? t("copied") : t("copyLink")}
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

              {/* Step-by-step OBS setup guide */}
              <details className="mt-3 rounded-xl border border-brand-200 bg-brand-50/70">
                <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-brand-800">
                  {t("obsGuideTitle")}
                </summary>
                <ol className="list-decimal space-y-1.5 pb-3 pl-9 pr-3 text-xs text-brand-900/70">
                  <li>{t("obsGuideStep1")}</li>
                  <li>{t("obsGuideStep2")}</li>
                  <li>{t("obsGuideStep3")}</li>
                  <li>{t("obsGuideStep4")}</li>
                  <li>{t("obsGuideStep5")}</li>
                </ol>
                <p className="px-3 pb-3 text-xs text-brand-600">
                  💡 {t("obsGuideNote")}
                </p>
              </details>
            </div>

            {/* Customize the alert card */}
            <div className="mt-4 space-y-3 border-t border-brand-900/10 pt-4">
              <p className="text-sm font-semibold text-brand-900/80">
                {t("obsCustomize")}
              </p>
              <p className="rounded-lg bg-brand-100/60 px-3 py-2 text-xs text-brand-900/70">
                ℹ️ {t("obsPriorityNote")}
              </p>

              {/* Color + live preview */}
              <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4">
                <ColorField
                  value={config.color}
                  fallback={DEFAULT_COLOR}
                  presets={PRESET_COLORS}
                  label={t("obsColor")}
                  codeLabel={t("obsColorCode")}
                  resetLabel={t("obsColorReset")}
                  defaultLabel={t("obsColorDefault")}
                  onSave={saveColor}
                  onReset={resetColor}
                />
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-medium text-brand-900/50">
                    {t("obsColorPreview")}
                  </p>
                  <div
                    className="w-full max-w-xs rounded-2xl p-4 text-white shadow-lg ring-1 ring-white/20"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${
                        config.color ?? DEFAULT_COLOR
                      }, color-mix(in srgb, ${
                        config.color ?? DEFAULT_COLOR
                      }, black 32%))`,
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
                    <p className="mt-1 text-xs text-white/95">
                      {t("obsPreviewMsg")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sound */}
              <div className="rounded-xl bg-brand-50 p-3">
                <div className="mb-1 flex items-center gap-3">
                  <span className="text-sm font-medium text-brand-900/80">
                    🔉 {t("obsSound")}
                  </span>
                </div>
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
                  <span className="text-xs text-brand-900/50">
                    {t("obsSoundHint")}
                  </span>
                </div>
              </div>

              {/* Random library — sounds */}
              <div className="rounded-xl bg-brand-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-brand-900/80">
                    🔀 {t("obsSoundLibrary")}
                  </span>
                  <label className="btn-secondary cursor-pointer px-3 py-1 text-xs">
                    {libUploading === "sound" ? t("obsUploading") : t("obsAddToLibrary")}
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/webm"
                      onChange={(e) => addLibrary("sound", e)}
                      className="hidden"
                    />
                  </label>
                </div>
                {config.librarySounds.length > 0 ? (
                  <ul className="mt-1 space-y-1">
                    {config.librarySounds.map((a, i) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 text-sm text-brand-900/70"
                      >
                        <button
                          onClick={() => playSound(a.url)}
                          className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-200"
                        >
                          ▶
                        </button>
                        <span className="flex-1 truncate">
                          {t("obsSound")} {i + 1}
                        </span>
                        <button
                          onClick={() => removeLibrary("sound", a.id)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          {t("obsRemove")}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-brand-900/45">{t("obsLibraryHint")}</p>
                )}
              </div>

              {/* Random library — stickers */}
              <div className="rounded-xl bg-brand-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-brand-900/80">
                    🔀 {t("obsStickerLibrary")}
                  </span>
                  <label className="btn-secondary cursor-pointer px-3 py-1 text-xs">
                    {libUploading === "sticker"
                      ? t("obsUploading")
                      : t("obsAddToLibrary")}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(e) => addLibrary("sticker", e)}
                      className="hidden"
                    />
                  </label>
                </div>
                {config.libraryStickers.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {config.libraryStickers.map((a) => (
                      <div key={a.id} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.url}
                          alt=""
                          className="h-14 w-14 rounded object-cover ring-1 ring-black/10"
                        />
                        <button
                          onClick={() => removeLibrary("sticker", a.id)}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white"
                          aria-label={t("obsRemove")}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-brand-900/45">{t("obsLibraryHint")}</p>
                )}
              </div>

              {/* Image / GIF */}
              <div className="rounded-xl bg-brand-50 p-3">
                <div className="mb-1 flex items-center gap-3">
                  <span className="text-sm font-medium text-brand-900/80">
                    🖼️ {t("obsImage")}
                  </span>
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
                  <span className="text-xs text-brand-900/50">
                    {t("obsImageHint")}
                  </span>
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
                  <span className="text-xs text-brand-900/50">
                    {t("obsVideoHint")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-brand-600">{t("obsVideoNote")}</p>
              </div>

              {/* Read-aloud (TTS) */}
              <div className="rounded-xl bg-brand-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-brand-900/80">
                      🔊 {t("obsTts")}
                    </p>
                    <p className="mt-0.5 text-xs text-brand-900/55">
                      {t("obsTtsHint")}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.ttsEnabled}
                    onClick={() => toggleTts(!config.ttsEnabled)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                      config.ttsEnabled ? "bg-brand-600" : "bg-brand-900/25"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        config.ttsEnabled ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
                {config.ttsEnabled && (
                  <button
                    onClick={testTts}
                    className="mt-2 rounded-full bg-brand-100 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-200"
                  >
                    ▶ {t("obsTtsTest")}
                  </button>
                )}
              </div>

              {error && (
                <p className="text-sm font-medium text-red-600">{error}</p>
              )}
            </div>
          </section>

          {/* ===== Goal bar ===== */}
          <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
            {/* On/off toggle */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-bold text-brand-900">
                  🎯 {t("obsGoalTitle")}
                </p>
                <p className="mt-0.5 text-xs text-brand-900/55">
                  {t("obsGoalToggleHint")}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.goalEnabled}
                onClick={() => toggleGoal(!config.goalEnabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  config.goalEnabled ? "bg-brand-600" : "bg-brand-900/25"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    config.goalEnabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            {config.goalEnabled && (
              <div className="mt-4 space-y-3 border-t border-brand-900/10 pt-4">
                {/* Goal setup — right here, no need to open Settings */}
                <div className="rounded-xl bg-brand-50 p-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-brand-900/70">
                      {t("obsGoalNameLabel")}
                    </span>
                    <input
                      value={goalTitle}
                      onChange={(e) => setGoalTitle(e.target.value)}
                      placeholder={t("obsGoalNamePlaceholder")}
                      maxLength={80}
                      className="input text-sm"
                    />
                  </label>
                  <label className="mt-2 block">
                    <span className="mb-1 block text-xs font-medium text-brand-900/70">
                      {t("obsGoalAmountLabel")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100000000}
                      value={goalAmount}
                      onChange={(e) => setGoalAmount(e.target.value)}
                      placeholder="5000"
                      className="input text-sm"
                    />
                  </label>
                  <button
                    onClick={saveGoal}
                    disabled={savingGoal}
                    className="btn-primary mt-3 w-full py-2 text-sm"
                  >
                    {savingGoal
                      ? t("obsGoalSaving")
                      : goalSaved
                        ? t("obsGoalSaved")
                        : t("obsGoalSave")}
                  </button>
                </div>

                {/* Goal-bar color (defaults to the alert color) */}
                <div className="rounded-xl bg-brand-50 p-3">
                  <ColorField
                    value={config.goalColor}
                    fallback={config.color ?? DEFAULT_COLOR}
                    presets={PRESET_COLORS}
                    label={t("obsGoalColor")}
                    codeLabel={t("obsColorCode")}
                    resetLabel={t("obsGoalColorReset")}
                    defaultLabel={t("obsGoalColorDefault")}
                    onSave={saveGoalColor}
                    onReset={resetGoalColor}
                  />
                </div>

                {/* URL */}
                <div>
                  <p className="mb-1 text-sm font-medium text-brand-900/70">
                    {t("obsGoalUrlLabel")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      readOnly
                      value={goalUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="input flex-1 text-xs"
                    />
                    <button
                      onClick={() => copy(goalUrl, "goal")}
                      className="btn-secondary shrink-0 px-4 py-2 text-sm"
                    >
                      {copied === "goal" ? t("copied") : t("copyLink")}
                    </button>
                    <a
                      href={goalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                    >
                      {t("obsPreview")}
                    </a>
                  </div>
                  <p className="mt-1 text-xs text-brand-900/55">
                    {t("obsGoalHint")}
                  </p>
                </div>

                {/* Live goal-bar preview */}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-brand-900/50">
                    {t("obsGoalPreview")}
                  </p>
                  {config.hasGoal ? (
                    <div className="overflow-hidden rounded-xl bg-neutral-800 ring-1 ring-black/20">
                      <iframe
                        key={`${goalUrl}#${goalRefresh}`}
                        src={goalUrl}
                        title="goal-bar preview"
                        className="h-[140px] w-full border-0"
                      />
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-brand-300 bg-white px-4 py-3 text-sm text-brand-900/60">
                      {t("obsGoalEmpty")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ===== Subathon timer ===== */}
          <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-bold text-brand-900">
                  ⏱️ {t("obsTimerTitle")}
                </p>
                <p className="mt-0.5 text-xs text-brand-900/55">
                  {t("obsTimerToggleHint")}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.timerEnabled}
                onClick={() => toggleTimer(!config.timerEnabled)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  config.timerEnabled ? "bg-brand-600" : "bg-brand-900/25"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    config.timerEnabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            {config.timerEnabled && (
              <div className="mt-4 space-y-3 border-t border-brand-900/10 pt-4">
                {/* Rate + initial + max */}
                <div className="space-y-3 rounded-xl bg-brand-50 p-3">
                  <div>
                    <span className="mb-1 block text-xs font-medium text-brand-900/70">
                      {t("obsTimerRateLabel")}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-brand-900/80">
                      <span>{t("obsTimerRateEvery")}</span>
                      <input
                        type="number"
                        min={1}
                        value={tBaht}
                        onChange={(e) => setTBaht(e.target.value)}
                        className="input w-20 text-sm"
                      />
                      <span>{t("obsTimerRateBahtEq")}</span>
                      <input
                        type="number"
                        min={1}
                        value={tMin}
                        onChange={(e) => setTMin(e.target.value)}
                        className="input w-20 text-sm"
                      />
                      <span>{t("obsTimerRateMin")}</span>
                    </div>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-brand-900/70">
                      {t("obsTimerInitialLabel")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={tInit}
                      onChange={(e) => setTInit(e.target.value)}
                      className="input text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-brand-900/70">
                      {t("obsTimerMaxLabel")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={tMax}
                      onChange={(e) => setTMax(e.target.value)}
                      placeholder={t("obsTimerMaxPlaceholder")}
                      className="input text-sm"
                    />
                  </label>
                  <div className="border-t border-brand-900/10 pt-3">
                    <ColorField
                      value={config.timerColor}
                      fallback={config.color ?? DEFAULT_COLOR}
                      presets={PRESET_COLORS}
                      label={t("obsTimerColor")}
                      codeLabel={t("obsColorCode")}
                      resetLabel={t("obsTimerColorReset")}
                      defaultLabel={t("obsTimerColorDefault")}
                      onSave={saveTimerColor}
                      onReset={resetTimerColor}
                    />
                  </div>
                  <button
                    onClick={saveTimerConfig}
                    disabled={savingTimer}
                    className="btn-primary w-full py-2 text-sm"
                  >
                    {savingTimer
                      ? t("obsGoalSaving")
                      : timerSaved
                        ? t("obsGoalSaved")
                        : t("obsTimerSave")}
                  </button>
                </div>

                {/* Control + live countdown (always shows a time) */}
                <div className="rounded-xl bg-brand-50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-brand-900/60">
                        {config.timerState === "running"
                          ? t("obsTimerStateRunning")
                          : config.timerState === "paused"
                            ? t("obsTimerStatePaused")
                            : t("obsTimerStateReady")}
                      </p>
                      <p
                        className={`text-3xl font-black tabular-nums text-brand-700 ${
                          config.timerState === "paused" ? "opacity-60" : ""
                        }`}
                      >
                        {fmtDuration(timerDisplay ?? config.timerInitialSeconds)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {config.timerState === "running" ? (
                        <button
                          onClick={() => timerControl("pause")}
                          className="rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-200"
                        >
                          {t("obsTimerPause")}
                        </button>
                      ) : (
                        <button
                          onClick={() => timerControl("start")}
                          className="btn-primary px-4 py-2 text-sm"
                        >
                          {config.timerState === "paused"
                            ? t("obsTimerResume")
                            : t("obsTimerStart")}
                        </button>
                      )}
                      <button
                        onClick={() => timerControl("reset")}
                        className="rounded-full bg-brand-100 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-200"
                      >
                        {t("obsTimerReset")}
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-brand-900/55">
                    {t("obsTimerControlHint")}
                  </p>
                </div>

                {/* URL + copy + preview */}
                <div>
                  <p className="mb-1 text-sm font-medium text-brand-900/70">
                    {t("obsTimerUrlLabel")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      readOnly
                      value={timerUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="input flex-1 text-xs"
                    />
                    <button
                      onClick={() => copy(timerUrl, "timer")}
                      className="btn-secondary shrink-0 px-4 py-2 text-sm"
                    >
                      {copied === "timer" ? t("copied") : t("copyLink")}
                    </button>
                    <a
                      href={timerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                    >
                      {t("obsPreview")}
                    </a>
                  </div>
                  <p className="mt-1 text-xs text-brand-900/55">
                    {t("obsTimerHint")}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
