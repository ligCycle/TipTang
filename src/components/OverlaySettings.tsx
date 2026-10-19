"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ColorField } from "./ColorField";
import { DEFAULT_COLOR, PRESET_COLORS } from "@/lib/colors";
import { ALERT_STYLES } from "@/lib/alertStyles";
import { ALERT_THEMES, DEFAULT_ALERT_THEME, darkCardGlow } from "@/lib/alertThemes";
import { Icon } from "@/components/Icon";
import { formatDate } from "@/lib/format";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OverlayConnectionStatus } from "@/components/OverlayConnectionStatus";
import { tipSeconds } from "@/lib/subathon-math";
import { SettingsSection } from "@/components/features/SettingsSection";
import { Switch } from "@/components/features/FeatureCard";

type Kind = "sound" | "image" | "video";
type LibItem = { id: string; url: string };
type Config = {
  url: string;
  /** Last time a live program loaded the alert overlay (ISO), null = never. */
  lastSeenAt: string | null;
  soundUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  color: string | null;
  alertStyle: string;
  alertTheme: string;
  bigTipThreshold: number;
  ttsEnabled: boolean;
  hasGoal: boolean;
  goalEnabled: boolean;
  goalTitle: string;
  goalAmount: string;
  goalStartedAt: string | null; // ISO from the API; null = never reset
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
  alertsEnabled: boolean;
  libraryVideos: LibItem[];
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


// Sample goal a creator starts from on the goal page (baht).
const DEFAULT_GOAL_AMOUNT = "1000";
const GOAL_SAVE_DELAY_MS = 800;

// Timer rate rows show what a tip of this size does with the current numbers.
const RATE_EXAMPLE_BAHT = 100;
function exampleMinutes(bahtPerUnit: string, minutesPerUnit: string): string {
  const sec = tipSeconds(RATE_EXAMPLE_BAHT, Number(bahtPerUnit), Number(minutesPerUnit) * 60);
  return String(Math.round(sec / 6) / 10); // minutes, one decimal at most
}

const FIELD: Record<Kind, keyof Config> = {
  sound: "soundUrl",
  image: "imageUrl",
  video: "videoUrl",
};

export type OverlayView = "all" | "alerts" | "goal" | "subathon" | "library";
export type OverlayConfig = Config;

export function OverlaySettings({
  view = "all",
  aside,
  tiersSlot,
  videosSlot,
}: {
  view?: OverlayView;
  /** Left column on feature pages (e.g. the alert preview); gets the loaded config. */
  aside?: (config: Config) => ReactNode;
  /** Alert tiers editor (section ⑤ on the alerts page). */
  tiersSlot?: (config: Config) => ReactNode;
  /** Library page: the video list (gets a reload for after uploads). */
  videosSlot?: (config: Config, reload: () => Promise<void>) => ReactNode;
} = {}) {
  const t = useTranslations("dashboard");
  const tHub = useTranslations("featureHub");
  const locale = useLocale();
  const dateLocale = locale === "th" ? "th-TH" : "en-US";
  const [config, setConfig] = useState<Config | null>(null);
  // Starts true: the config is fetched as soon as the page mounts.
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<"alert" | "goal" | "timer" | null>(null);
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState<"ok" | "error" | null>(null);
  const [uploading, setUploading] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [goalSaved, setGoalSaved] = useState(false);
  // Goal name/amount save by themselves shortly after typing stops.
  const goalSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);
  const [resettingGoal, setResettingGoal] = useState(false);
  const [goalResetOpen, setGoalResetOpen] = useState(false);
  const [goalRefresh, setGoalRefresh] = useState(0);
  // Bumped after the timer settings save, to reload its live preview.
  const [timerRefresh, setTimerRefresh] = useState(0);
  const [libUploading, setLibUploading] = useState<"sound" | "sticker" | null>(
    null,
  );
  const [bigTip, setBigTip] = useState("0");
  const [bigTipSaved, setBigTipSaved] = useState(false);
  const bigTipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Subathon timer config inputs (kept in minutes for the UI).
  const [tBaht, setTBaht] = useState("10");
  const [tMin, setTMin] = useState("1");
  const [tInit, setTInit] = useState("60");
  const [tMax, setTMax] = useState("");
  // Sabotage (reduce) settings, same units as above.
  const [tReduceOn, setTReduceOn] = useState(false);
  const [tRBaht, setTRBaht] = useState("20");
  const [tRMin, setTRMin] = useState("1");
  const [tRMinAmt, setTRMinAmt] = useState("20");
  const [tFloor, setTFloor] = useState("5");
  const [tShowRates, setTShowRates] = useState(true);
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

  async function load() {
    try {
      const res = await fetch("/api/overlay/setup", { method: "POST" });
      const d = await res.json();
      if (res.ok && d.key) {
        setConfig({
          url: `${window.location.origin}/overlay/${d.username}?key=${d.key}`,
          lastSeenAt: d.overlayLastSeenAt ?? null,
          soundUrl: d.soundUrl ?? null,
          imageUrl: d.imageUrl ?? null,
          videoUrl: d.videoUrl ?? null,
          color: d.color ?? null,
          alertStyle: d.alertStyle ?? "pop",
          alertTheme: d.alertTheme ?? "light",
          bigTipThreshold: d.bigTipThreshold ?? 0,
          ttsEnabled: Boolean(d.ttsEnabled),
          hasGoal: Boolean(d.hasGoal),
          goalEnabled: d.goalEnabled !== false,
          goalTitle: d.goalTitle ?? "",
          goalAmount: d.goalAmount ?? "",
          goalStartedAt: d.goalStartedAt ?? null,
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
          alertsEnabled: d.alertsEnabled !== false,
          libraryVideos: d.libraryVideos ?? [],
        });
        // On the goal page, a creator with no goal yet starts from a sample one
        // (saved right away) so the live preview shows a real bar, not a blank.
        if (view === "goal" && !d.goalTitle && !d.goalAmount) {
          const title = tHub("goalDefaultTitle");
          setGoalTitle(title);
          setGoalAmount(DEFAULT_GOAL_AMOUNT);
          void saveGoal(title, DEFAULT_GOAL_AMOUNT);
        } else {
          setGoalTitle(d.goalTitle ?? "");
          setGoalAmount(d.goalAmount ?? "");
        }
        setBigTip(String(d.bigTipThreshold ?? 0));
        setTBaht(String(d.timerBahtPerUnit ?? 10));
        setTMin(String(Math.round((d.timerSecondsPerUnit ?? 60) / 60)));
        setTInit(String(Math.round((d.timerInitialSeconds ?? 3600) / 60)));
        setTMax(d.timerMaxSeconds ? String(Math.round(d.timerMaxSeconds / 60)) : "");
        setTReduceOn(Boolean(d.timerReduceEnabled));
        setTRBaht(String(d.timerReduceBahtPerUnit ?? 20));
        setTRMin(String(Math.round((d.timerReduceSecondsPerUnit ?? 60) / 60)));
        setTRMinAmt(String(d.timerReduceMinAmount ?? 20));
        setTFloor(String(Math.round((d.timerFloorSeconds ?? 300) / 60)));
        setTShowRates(d.timerShowRates !== false);
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

  // Load the overlay config on mount. Only async callbacks set state here
  // (no synchronous setState inside the effect), which is why `loading`
  // starts out true instead of being flipped on at the top of load().
  useEffect(() => {
    void load();
  }, []);

  async function copy(text: string, which: "alert" | "goal" | "timer") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  // New key → every overlay URL (alert, goal, timer) changes; the old ones
  // stop working immediately.
  async function rotateKey() {
    if (!config || !window.confirm(t("obsRotateConfirm"))) return;
    setRotating(true);
    setRotated(null);
    try {
      const res = await fetch("/api/overlay/key", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.key) throw new Error();
      const url = new URL(config.url);
      url.searchParams.set("key", d.key);
      // The old URL is dead, so the program has to load the new one first.
      setConfig({ ...config, url: url.toString(), lastSeenAt: null });
      setRotated("ok");
    } catch {
      setRotated("error");
    } finally {
      setRotating(false);
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
      fd.set("reduceEnabled", tReduceOn ? "true" : "false");
      fd.set("reduceBahtPerUnit", tRBaht || "20");
      fd.set("reduceSecondsPerUnit", String((Number(tRMin) || 1) * 60));
      fd.set("reduceMinAmount", tRMinAmt || "20");
      fd.set("floorSeconds", String((Number(tFloor) || 0) * 60));
      fd.set("showRates", tShowRates ? "true" : "false");
      // Persist the staged clock color in the same request ("" = use alert color).
      fd.set("color", config?.timerColor ?? "");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      if (res.ok) {
        setTimerSaved(true);
        setTimeout(() => setTimerSaved(false), 1500);
        setTimerRefresh((n) => n + 1);
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

  // Timer settings save by themselves shortly after the last change (like the
  // goal). The first snapshot is the loaded config, so loading saves nothing.
  const timerSnap = JSON.stringify([
    tBaht, tMin, tInit, tMax, tReduceOn, tRBaht, tRMin, tRMinAmt, tFloor, tShowRates,
    config?.timerColor ?? null,
  ]);
  const timerSnapshot = useRef<string | null>(null);
  useEffect(() => {
    if (!config) return;
    if (timerSnapshot.current === null) {
      timerSnapshot.current = timerSnap;
      return;
    }
    if (timerSnapshot.current === timerSnap) return;
    const id = setTimeout(() => {
      timerSnapshot.current = timerSnap;
      void saveTimerConfig();
    }, GOAL_SAVE_DELAY_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerSnap, config !== null]);

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

  async function saveGoal(title: string, amount: string) {
    setSavingGoal(true);
    try {
      const fd = new FormData();
      fd.set("kind", "goalSet");
      fd.set("title", title);
      fd.set("amount", amount || "0");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setConfig((c) =>
          c
            ? {
                ...c,
                goalTitle: title,
                goalAmount: amount,
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

  // Debounced autosave for the goal name/amount inputs.
  function queueGoalSave(title: string, amount: string) {
    if (goalSaveTimer.current) clearTimeout(goalSaveTimer.current);
    goalSaveTimer.current = setTimeout(() => void saveGoal(title, amount), GOAL_SAVE_DELAY_MS);
  }

  // Runs after the creator confirms in the dialog (it lands on stream within
  // seconds, so the button itself only opens the dialog).
  async function resetGoal() {
    setResettingGoal(true);
    try {
      const fd = new FormData();
      fd.set("kind", "goalReset");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok && typeof d.goalStartedAt === "string") {
        setConfig((c) => (c ? { ...c, goalStartedAt: d.goalStartedAt } : c));
        setGoalRefresh((n) => n + 1); // reload the preview iframe, like saveGoal
      }
    } finally {
      setResettingGoal(false);
      setGoalResetOpen(false);
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
    const text = "ผู้สนับสนุนตัวอย่าง ทิป 100 บาท ทดสอบเสียงอ่านโดเนท";
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

  // Alert entrance/exit animation style — saved immediately on pick.
  async function saveAlertStyle(style: string) {
    setConfig((c) => (c ? { ...c, alertStyle: style } : c));
    const fd = new FormData();
    fd.set("kind", "alertStyle");
    fd.set("style", style);
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
  }

  // Alert card theme — saved immediately on pick.
  async function saveAlertTheme(theme: string) {
    setConfig((c) => (c ? { ...c, alertTheme: theme } : c));
    const fd = new FormData();
    fd.set("kind", "alertTheme");
    fd.set("theme", theme);
    await fetch("/api/overlay/asset", { method: "POST", body: fd });
  }

  // Big-tip threshold (baht; 0 = off). Server coerces to a clean Int.
  // Saves by itself shortly after typing stops (no save button).
  async function saveBigTip(raw: string) {
    const fd = new FormData();
    fd.set("kind", "bigTipThreshold");
    fd.set("value", raw || "0");
    const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
    if (!res.ok) return;
    const d = await res.json().catch(() => ({}));
    const value = d.value ?? 0;
    setConfig((c) => (c ? { ...c, bigTipThreshold: value } : c));
    setBigTipSaved(true);
    setTimeout(() => setBigTipSaved(false), 1500);
  }

  function queueBigTipSave(raw: string) {
    if (bigTipTimer.current) clearTimeout(bigTipTimer.current);
    bigTipTimer.current = setTimeout(() => void saveBigTip(raw), GOAL_SAVE_DELAY_MS);
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

  const styleLabels: Record<string, string> = {
    pop: t("obsStylePop"),
    slide: t("obsStyleSlide"),
    bounce: t("obsStyleBounce"),
    fade: t("obsStyleFade"),
    zoom: t("obsStyleZoom"),
    glow: t("obsStyleGlow"),
  };

  // The colour the real alert card uses: the creator's pick, else the
  // default. The preview card and both theme tiles all show this one.
  const alertColor = config?.color ?? DEFAULT_COLOR;
  const alertGradient = `linear-gradient(135deg, ${alertColor}, color-mix(in srgb, ${alertColor}, black 32%))`;
  const alertGlow = darkCardGlow(alertColor);

  const headerBlock = (
    <>
      <h1 className="flex items-center gap-2 text-2xl font-extrabold text-brand-900">
        <Icon name="monitor" className="h-6 w-6" />
        {t("obsTitle")}
      </h1>
      <p className="mt-1 text-sm text-brand-900/65">{t("obsDesc")}</p>
    </>
  );

  if (!config) {
    const waiting = (
      <p className="mt-6 text-sm text-brand-900/60" aria-live="polite">
        {loading ? t("processing") : t("obsLoadFailed")}
      </p>
    );
    return view === "all" ? (
      <div>
        {headerBlock}
        {waiting}
      </div>
    ) : (
      waiting
    );
  }

  const obsBlock = (
    <>
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
              <OverlayConnectionStatus
                key={config.url}
                initialLastSeenAt={config.lastSeenAt}
              />
              <p className="mt-1 text-xs text-brand-900/55">{t("obsHint")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-brand-900/55">{t("obsRotateHint")}</span>
                <button
                  type="button"
                  onClick={rotateKey}
                  disabled={rotating}
                  className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline disabled:opacity-50"
                >
                  <Icon name="refresh" className="h-3.5 w-3.5" />
                  {t("obsRotate")}
                </button>
              </div>
              {rotated === "ok" && (
                <p className="mt-1 text-xs font-medium text-emerald-700" role="status">
                  {t("obsRotated")}
                </p>
              )}
              {rotated === "error" && (
                <p className="mt-1 text-xs font-medium text-red-600" role="status">
                  {t("obsRotateFailed")}
                </p>
              )}

              {/* Step-by-step OBS setup guide */}
              <details className="mt-3 rounded-xl border border-brand-200 bg-brand-50/70">
                <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-semibold text-brand-800">
                  <Icon name="book-open" />
                  {t("obsGuideTitle")}
                </summary>
                <ol className="list-decimal space-y-1.5 pb-3 pl-9 pr-3 text-xs text-brand-900/70">
                  <li>{t("obsGuideStep1")}</li>
                  <li>{t("obsGuideStep2")}</li>
                  <li>{t("obsGuideStep3")}</li>
                  <li>{t("obsGuideStep4")}</li>
                  <li>{t("obsGuideStep5")}</li>
                </ol>
                <p className="flex items-start gap-2 px-3 pb-3 text-xs text-brand-600">
                  <Icon name="lightbulb" className="mt-px h-3.5 w-3.5" />
                  <span>{t("obsGuideNote")}</span>
                </p>
              </details>

              {/* Same URL, other live programs — and what to do on a phone */}
              <details className="mt-2 rounded-xl border border-brand-200 bg-brand-50/70">
                <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-semibold text-brand-800">
                  <Icon name="monitor" />
                  {t("obsOtherTitle")}
                </summary>
                <ul className="list-disc space-y-1.5 pb-3 pl-9 pr-3 text-xs text-brand-900/70">
                  <li>{t("obsOtherStreamlabs")}</li>
                  <li>{t("obsOtherTiktok")}</li>
                  <li>{t("obsOtherPrism")}</li>
                  <li>{t("obsOtherMobile")}</li>
                </ul>
              </details>
            </div>
    </>
  );
  const lookBlock = (
    <>
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
                {/* Feature pages have the real preview beside the settings. */}
                {view === "all" && (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-medium text-brand-900/50">
                    {t("obsColorPreview")}
                  </p>
                  <div
                    className="w-full max-w-xs rounded-2xl p-4 text-white shadow-lg ring-1 ring-white/20"
                    style={{ backgroundImage: alertGradient }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-extrabold drop-shadow">
                        <Icon name="user" className="h-3.5 w-3.5" />
                        {t("obsPreviewName")}
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
                )}
              </div>

              {/* Alert card theme */}
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium text-brand-900/80">
                  <Icon name="palette" />
                  {t("obsAlertTheme")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ALERT_THEMES.map((th) => {
                    const active = (config.alertTheme || DEFAULT_ALERT_THEME) === th;
                    return (
                      <button
                        key={th}
                        type="button"
                        aria-pressed={active}
                        onClick={() => saveAlertTheme(th)}
                        className={`rounded-xl border-2 p-2 text-left text-sm font-medium transition ${
                          active ? "border-brand-600" : "border-transparent hover:border-brand-200"
                        }`}
                      >
                        <span
                          className={`mb-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white ${
                            th === "dark" ? "border bg-[#120c16]" : ""
                          }`}
                          style={
                            th === "dark"
                              ? { borderColor: alertGlow, boxShadow: `0 0 12px ${alertGlow}73` }
                              : { backgroundImage: alertGradient }
                          }
                        >
                          <span className="inline-flex items-center gap-1">
                            <Icon name="heart" className="h-3 w-3" />
                            {t("obsThemeSample")}
                          </span>
                          <span
                            className={`rounded-full px-1.5 ${
                              th === "dark" ? "bg-[#ff8a3d] text-[#5a1f0b]" : "bg-white/25"
                            }`}
                          >
                            ฿100
                          </span>
                        </span>
                        <span className="text-brand-900">
                          {th === "dark" ? t("obsThemeDark") : t("obsThemeLight")}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-brand-900/50">{t("obsAlertThemeHint")}</p>
              </div>

              {/* Alert animation style */}
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium text-brand-900/80">
                  <Icon name="sparkles" />
                  {t("obsAlertStyle")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {ALERT_STYLES.map((s) => {
                    const active = (config.alertStyle || "pop") === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => saveAlertStyle(s)}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                          active
                            ? "bg-brand-600 text-white"
                            : "bg-brand-100 text-brand-700 hover:bg-brand-200"
                        }`}
                      >
                        {styleLabels[s] ?? s}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-brand-900/50">
                  {view === "all" ? t("obsAlertStyleHint") : tHub("styleHintPreview")}
                </p>
              </div>

              {/* Big-tip celebration */}
              <div className="rounded-xl bg-brand-50 p-3">
                <p className="mb-1 flex items-center gap-2 text-sm font-medium text-brand-900/80">
                  <Icon name="gift" />
                  {t("obsBigTip")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={bigTip}
                    onChange={(e) => {
                      setBigTip(e.target.value);
                      queueBigTipSave(e.target.value);
                    }}
                    placeholder="0"
                    className="input w-32! text-sm"
                  />
                  <span className="text-sm text-brand-900/70">
                    {t("obsBigTipUnit")}
                  </span>
                  {bigTipSaved && (
                    <span className="text-xs text-brand-900/55" aria-live="polite">{t("obsGoalSaved")}</span>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-brand-900/50">
                  {t("obsBigTipHint")}
                </p>
              </div>

    </>
  );
  const soundBlock = (
    <>
              {/* Sound */}
              <div className="rounded-xl bg-brand-50 p-3">
                <div className="mb-1 flex items-center gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-brand-900/80">
                    <Icon name="volume" />
                    {t("obsSound")}
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

    </>
  );
  const libSoundsBlock = (
    <>
              {/* Random library — sounds */}
              <div className="rounded-xl bg-brand-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-brand-900/80">
                    <Icon name="shuffle" />
                    {t("obsSoundLibrary")}
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

    </>
  );
  const libStickersBlock = (
    <>
              {/* Random library — stickers */}
              <div className="rounded-xl bg-brand-50 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-medium text-brand-900/80">
                    <Icon name="shuffle" />
                    {t("obsStickerLibrary")}
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
                          <Icon name="x" className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-brand-900/45">{t("obsLibraryHint")}</p>
                )}
              </div>

    </>
  );
  const imageBlock = (
    <>
              {/* Image / GIF */}
              <div className="rounded-xl bg-brand-50 p-3">
                <div className="mb-1 flex items-center gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-brand-900/80">
                    <Icon name="image" />
                    {t("obsImage")}
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

    </>
  );
  const videoBlock = (
    <>
              {/* Video (takes priority) */}
              <div className="rounded-xl bg-brand-50 p-3">
                <div className="mb-1 flex items-center gap-3">
                  <span className="flex items-center gap-2 text-sm font-medium text-brand-900/80">
                    <Icon name="video" />
                    {t("obsVideo")}
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

    </>
  );
  const ttsBlock = (
    <>
              {/* Read-aloud (TTS) */}
              <div className="rounded-xl bg-brand-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium text-brand-900/80">
                      <Icon name="mic" />
                      {t("obsTts")}
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

    </>
  );
  const errorBlock = (
    <>
              {error && (
                <p className="text-sm font-medium text-red-600">{error}</p>
              )}
    </>
  );
  const goalBlock = (
    <>
          {/* ===== Goal bar ===== */}
          <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
            {/* On/off toggle */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-base font-bold text-brand-900">
                  <Icon name="target" className="h-4 w-4" />
                  {t("obsGoalTitle")}
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
                      onChange={(e) => {
                        setGoalTitle(e.target.value);
                        queueGoalSave(e.target.value, goalAmount);
                      }}
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
                      onChange={(e) => {
                        setGoalAmount(e.target.value);
                        queueGoalSave(goalTitle, e.target.value);
                      }}
                      placeholder={DEFAULT_GOAL_AMOUNT}
                      className="input text-sm"
                    />
                  </label>
                  {/* No save button: changes save by themselves. */}
                  <p className="mt-2 h-4 text-xs text-brand-900/55" aria-live="polite">
                    {savingGoal ? t("obsGoalSaving") : goalSaved ? t("obsGoalSaved") : tHub("autoSaveHint")}
                  </p>
                  {config.hasGoal && (
                    <button
                      type="button"
                      onClick={() => setGoalResetOpen(true)}
                      disabled={resettingGoal || savingGoal}
                      className="btn-secondary mt-2 w-full py-2 text-sm"
                    >
                      {resettingGoal ? t("obsGoalResetting") : t("obsGoalReset")}
                    </button>
                  )}
                  <ConfirmDialog
                    open={goalResetOpen}
                    message={t("obsGoalResetConfirm")}
                    confirmLabel={t("obsGoalReset")}
                    busy={resettingGoal}
                    onConfirm={resetGoal}
                    onCancel={() => setGoalResetOpen(false)}
                  />
                  {config.goalStartedAt && (
                    <p className="mt-2 text-center text-xs text-brand-900/55">
                      {t("obsGoalSince", {
                        date: formatDate(config.goalStartedAt, dateLocale),
                      })}
                    </p>
                  )}
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
                    <p className="rounded-xl border border-dashed border-brand-300 px-4 py-3 text-sm text-brand-900/60">
                      {t("obsGoalEmpty")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
    </>
  );
  const timerBlock = (
    <>
          {/* ===== Subathon timer ===== */}
          <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-base font-bold text-brand-900">
                  <Icon name="clock" className="h-4 w-4" />
                  {t("obsTimerTitle")}
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
                    {/* One sentence: "tip every [10] baht, add [1] min" (w-*! beats .input's width). */}
                    <div className="flex flex-wrap items-center gap-2 text-sm text-brand-900/80">
                      <span>{t("obsTimerRateEvery")}</span>
                      <input
                        type="number"
                        min={1}
                        value={tBaht}
                        onChange={(e) => setTBaht(e.target.value)}
                        className="input w-20! text-sm"
                        aria-label={t("obsTimerRateLabel")}
                      />
                      <span>{t("obsTimerRateBahtEq")}</span>
                      <input
                        type="number"
                        min={1}
                        value={tMin}
                        onChange={(e) => setTMin(e.target.value)}
                        className="input w-20! text-sm"
                        aria-label={t("obsTimerRateMin")}
                      />
                      <span>{t("obsTimerRateMin")}</span>
                    </div>
                    <p className="mt-1 text-xs text-brand-900/55">
                      {t("obsTimerRateExample", { baht: RATE_EXAMPLE_BAHT, min: exampleMinutes(tBaht, tMin) })}
                    </p>
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
                  {/* Sabotage: viewers may pay to reduce the clock */}
                  <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={tReduceOn}
                        onChange={(e) => setTReduceOn(e.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-brand-600"
                      />
                      <span>
                        <span className="block text-sm font-medium text-brand-900/80">
                          {t("obsReduceToggle")}
                        </span>
                        <span className="mt-0.5 block text-xs text-brand-900/55">
                          {t("obsReduceHint")}
                        </span>
                      </span>
                    </label>
                    {tReduceOn && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <span className="mb-1 block text-xs font-medium text-brand-900/70">
                            {t("obsReduceRateLabel")}
                          </span>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-brand-900/70">
                            <span>{t("obsTimerRateEvery")}</span>
                            <input
                              type="number"
                              min={1}
                              value={tRBaht}
                              onChange={(e) => setTRBaht(e.target.value)}
                              className="input w-20! text-sm"
                              aria-label={t("obsReduceRateLabel")}
                            />
                            <span>{t("obsReduceBahtEq")}</span>
                            <input
                              type="number"
                              min={1}
                              value={tRMin}
                              onChange={(e) => setTRMin(e.target.value)}
                              className="input w-20! text-sm"
                              aria-label={t("obsTimerRateMin")}
                            />
                            <span>{t("obsTimerRateMin")}</span>
                          </div>
                          <p className="mt-1 text-xs text-brand-900/55">
                            {t("obsReduceExample", { baht: RATE_EXAMPLE_BAHT, min: exampleMinutes(tRBaht, tRMin) })}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-brand-900/70">
                              {t("obsReduceMinLabel")}
                            </span>
                            <input
                              type="number"
                              min={1}
                              value={tRMinAmt}
                              onChange={(e) => setTRMinAmt(e.target.value)}
                              className="input text-sm"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-brand-900/70">
                              {t("obsFloorLabel")}
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={tFloor}
                              onChange={(e) => setTFloor(e.target.value)}
                              className="input text-sm"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
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
                  {/* No save button: changes save by themselves. */}
                  <p className="h-4 text-xs text-brand-900/55" aria-live="polite">
                    {savingTimer ? t("obsGoalSaving") : timerSaved ? t("obsGoalSaved") : tHub("autoSaveHintAll")}
                  </p>
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
                        className={`text-3xl font-black tabular-nums ${
                          config.timerState === "paused" ? "opacity-60" : ""
                        }`}
                        style={{
                          color: config.timerColor ?? config.color ?? DEFAULT_COLOR,
                        }}
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

                {/* Live clock preview — the real overlay, as OBS shows it —
                    with the rates-line switch right above what it changes. */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-brand-300 bg-brand-50 p-3">
                    <span className="flex min-w-0 items-start gap-2">
                      <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                      <span>
                        <span className="block text-sm font-bold text-brand-900">{tHub("timerShowRates")}</span>
                        <span className="block text-xs text-brand-900/60">{tHub("timerShowRatesHint")}</span>
                      </span>
                    </span>
                    <Switch checked={tShowRates} onChange={setTShowRates} label={tHub("timerShowRates")} />
                  </div>
                  <p className="mb-1.5 text-xs font-medium text-brand-900/50">
                    {tHub("timerPreview")}
                  </p>
                  <div className="overflow-hidden rounded-xl bg-neutral-800 ring-1 ring-black/20">
                    <iframe
                      key={`${timerUrl}#${timerRefresh}`}
                      src={timerUrl}
                      title="timer preview"
                      className="h-[260px] w-full border-0"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
    </>
  );

  // view "all" is the original one-page layout; the feature-hub pages mount
  // one feature each, with numbered sections (and an optional left column).
  if (view === "all") {
    return (
      <div>
        {headerBlock}

        {(
          <div className="mt-4 space-y-6">
          {/* ===== Alert card ===== */}
          <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
            <h3 className="flex items-center gap-2 text-base font-bold text-brand-900">
              <Icon name="bell" className="h-4 w-4" />
              {t("obsAlertSection")}
            </h3>
            <p className="mb-3 mt-0.5 text-xs text-brand-900/55">
              {t("obsAlertSectionDesc")}
            </p>

            <div>
              {obsBlock}
            </div>

            {/* Customize the alert card */}
            <div className="mt-4 space-y-3 border-t border-brand-900/10 pt-4">
              <p className="text-sm font-semibold text-brand-900/80">
                {t("obsCustomize")}
              </p>
              <p className="flex items-start gap-2 rounded-lg bg-brand-100/60 px-3 py-2 text-xs text-brand-900/70">
                <Icon name="lightbulb" className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{t("obsPriorityNote")}</span>
              </p>

              {lookBlock}
              {soundBlock}
              {libSoundsBlock}
              {libStickersBlock}
              {imageBlock}
              {videoBlock}
              {ttsBlock}
              {errorBlock}
            </div>
          </section>

          {goalBlock}

          {timerBlock}
          </div>
        )}
      </div>
    );
  }

  const body =
    view === "alerts" ? (
      <div className="space-y-3">
        {/* This feature's own OBS link — open until OBS has connected once. */}
        <SettingsSection index={1} title={tHub("secObs")} defaultOpen={!config.lastSeenAt}>
          {obsBlock}
        </SettingsSection>
        <SettingsSection index={2} title={tHub("secLook")} defaultOpen>
          {lookBlock}
        </SettingsSection>
        <SettingsSection index={3} title={tHub("secMedia")}>
          {soundBlock}
          {imageBlock}
          {videoBlock}
        </SettingsSection>
        <SettingsSection index={4} title={tHub("secTts")}>{ttsBlock}</SettingsSection>
        {tiersSlot && (
          <SettingsSection index={5} title={tHub("secTiers")}>{tiersSlot(config)}</SettingsSection>
        )}
        {errorBlock}
      </div>
    ) : view === "goal" ? (
      <div className="space-y-3">
        {goalBlock}
        {errorBlock}
      </div>
    ) : view === "subathon" ? (
      <div className="space-y-3">
        {timerBlock}
        {errorBlock}
      </div>
    ) : (
      <div className="space-y-4">
        {libSoundsBlock}
        {libStickersBlock}
        {videosSlot?.(config, load)}
        {errorBlock}
      </div>
    );

  return aside ? (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <div className="lg:sticky lg:top-4">{aside(config)}</div>
      {body}
    </div>
  ) : (
    body
  );
}
