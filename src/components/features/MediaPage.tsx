"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ColorField } from "@/components/ColorField";
import { Switch } from "@/components/features/FeatureCard";
import { FeatureSettingsLayout } from "@/components/features/FeaturePages";
import { AutoSaveInput } from "@/components/features/LibraryBits";
import { loadHub, type HubState } from "@/components/features/FeatureHub";
import { DEFAULT_COLOR, PRESET_COLORS } from "@/lib/colors";
import { MEDIA_MAX_SEC_CHOICES } from "@/lib/media";
import type { MediaListRow } from "@/lib/media-queue";

type MediaState = {
  username: string;
  enabled: boolean;
  minAmount: number;
  maxSec: number;
  autoApprove: boolean;
  autoAcked: boolean;
  volume: number;
  paused: boolean;
  color: string | null;
  alertColor: string | null;
  creatorMin: number;
  live: boolean;
  queue: { playing: MediaListRow[]; pending: MediaListRow[]; upNext: MediaListRow[]; history: MediaListRow[] };
};

const QUEUE_REFRESH_MS = 5000;
const WARNINGS = ["warn1", "warn2", "warn3", "warn4"] as const;

async function fetchMedia(): Promise<MediaState | null> {
  const res = await fetch("/api/media", { cache: "no-store" }).catch(() => null);
  return res?.ok ? res.json() : null;
}

function Modal({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="card max-h-[90vh] w-full max-w-lg overflow-x-hidden overflow-y-auto rounded-2xl p-5 shadow-2xl">{children}</div>
    </div>
  );
}

/**
 * "ขอคลิป/เพลง" settings: the queue of fans' clips (approve, skip, move up,
 * remove), the rules (minimum, length, auto-approve behind a copyright
 * warning, volume, pause) and the OBS link with colour and a test clip.
 */
export function MediaPage() {
  const t = useTranslations("mediaPage");
  const tHub = useTranslations("featureHub");
  const tc = useTranslations("common");
  const [data, setData] = useState<MediaState | null>(null);
  const [hub, setHub] = useState<HubState | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [test, setTest] = useState<"sent" | "failed" | null>(null);
  const [acking, setAcking] = useState(false);
  const [ackFailed, setAckFailed] = useState(false);
  // The slider moves freely; the value saves shortly after it stops.
  const [volume, setVolume] = useState<number | null>(null);
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(
    () => () => {
      if (volumeTimer.current) clearTimeout(volumeTimer.current);
    },
    [],
  );

  useEffect(() => {
    fetchMedia().then((d) => d && setData(d));
    loadHub().then(setHub);
    // The queue moves on its own (fans tip, clips end): refresh it, never the settings being edited.
    const id = setInterval(
      () => fetchMedia().then((d) => d && setData((cur) => (cur ? { ...cur, queue: d.queue, live: d.live } : d))),
      QUEUE_REFRESH_MS,
    );
    return () => clearInterval(id);
  }, []);

  /** Settings save one at a time; the answer is the whole new state. */
  function save(body: Record<string, unknown>): Promise<boolean> {
    const run = queue.current.then(async () => {
      const res = await fetch("/api/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => null);
      const d = res?.ok ? ((await res.json()) as MediaState) : null;
      setError(!d);
      if (d) setData(d);
      return Boolean(d);
    });
    queue.current = run.catch(() => {});
    return run;
  }

  async function act(id: string, action: "approve" | "remove" | "skip" | "top") {
    setBusyId(id);
    const res = await fetch(`/api/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    // 404 = the clip already moved on (ended, or the tip was rejected): just refresh.
    setError(Boolean(res && !res.ok && res.status !== 404) || !res);
    const d = await fetchMedia();
    if (d) setData((cur) => (cur ? { ...cur, queue: d.queue, live: d.live } : d));
    setBusyId(null);
  }

  async function testOnObs() {
    setTest(null);
    const res = await fetch("/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
    }).catch(() => null);
    setTest(res?.ok ? "sent" : "failed");
    const d = res?.ok ? ((await res.json()) as MediaState) : null;
    if (d) setData((cur) => (cur ? { ...cur, queue: d.queue } : d));
  }

  function changeVolume(n: number) {
    setVolume(n);
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(async () => {
      // Failed: the slider goes back to what OBS is really using.
      if (!(await save({ volume: n }))) setVolume(null);
    }, 400);
  }

  function setAuto(next: boolean) {
    if (next && !data?.autoAcked) {
      setUnderstood(false);
      setAckFailed(false);
      setWarnOpen(true);
      return;
    }
    void save({ autoApprove: next });
  }

  if (!data) return null;
  const obsUrl = hub ? `${hub.overlayBase}/media?key=${hub.overlayKey}` : null;
  const q = data.queue;

  async function copy() {
    if (!obsUrl) return;
    try {
      await navigator.clipboard.writeText(obsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  const btn = "rounded-full border px-2.5 py-1 text-xs font-semibold disabled:opacity-50";
  const row = (r: MediaListRow, actions: React.ReactNode) => (
    <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`} alt="" className="h-12 w-20 shrink-0 rounded-lg bg-brand-100 object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-brand-900">{r.title}</p>
        <p className="truncate text-xs text-brand-900/60">
          {r.test ? t("testRow") : t("by", { fan: r.fan || t("anonymous"), amount: r.amount.toLocaleString() })}
          {r.startSec > 0 && ` · ${t("startsAt", { time: clock(r.startSec) })}`}
        </p>
        {r.message && <p className="truncate text-xs text-brand-900/50">“{r.message}”</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5">{actions}</div>
    </li>
  );

  return (
    <FeatureSettingsLayout
      title={tHub("f_media")}
      headerExtra={
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-900/75">
          {tHub("enable")}
          <Switch checked={data.enabled} onChange={(next) => void save({ enabled: next })} label={tHub("f_media")} />
        </span>
      }
    >
      <p className="text-sm text-brand-900/65">{t("howItWorks")}</p>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${data.live ? "bg-emerald-100 text-emerald-700" : "bg-brand-900/10 text-brand-900/60"}`}>
          <span className={`h-2 w-2 rounded-full ${data.live ? "bg-emerald-500" : "bg-brand-900/30"}`} />
          {data.live ? t("linkLive") : t("linkOff")}
        </span>
        {data.paused && <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t("pausedNote")}</span>}
      </p>
      {error && <p className="text-sm font-medium text-red-600">{t("saveFailed")}</p>}

      <section className="space-y-3 rounded-2xl border border-brand-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-brand-900">① {t("queue")}</h2>
          <span className="flex items-center gap-2 text-sm font-semibold text-brand-900/75">
            {t("pause")}
            <Switch checked={data.paused} onChange={(next) => void save({ paused: next })} label={t("pause")} />
          </span>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-brand-900/80">{t("nowPlaying")}</h3>
          {q.playing.length === 0 ? (
            <p className="mt-1 text-sm text-brand-900/50">{t("nothingPlaying")}</p>
          ) : (
            <ul className="mt-1 space-y-2">
              {q.playing.map((r) =>
                row(
                  r,
                  <button type="button" disabled={busyId === r.id} onClick={() => act(r.id, "skip")} className={`${btn} border-red-300 text-red-700 hover:bg-red-50 dark:border-red-400/50 dark:text-red-300 dark:hover:bg-red-500/10`}>
                    {t("skip")}
                  </button>,
                ),
              )}
            </ul>
          )}
        </div>

        {(q.pending.length > 0 || !data.autoApprove) && (
          <div>
            <h3 className="text-sm font-semibold text-brand-900/80">{t("waitingApproval", { count: q.pending.length })}</h3>
            {q.pending.length === 0 ? (
              <p className="mt-1 text-sm text-brand-900/50">{t("noneWaiting")}</p>
            ) : (
              <ul className="mt-1 space-y-2">
                {q.pending.map((r) =>
                  row(
                    r,
                    <>
                      <button type="button" disabled={busyId === r.id} onClick={() => act(r.id, "approve")} className={`${btn} border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-400/50 dark:bg-emerald-500/10 dark:text-emerald-300`}>
                        {t("approve")}
                      </button>
                      <button type="button" disabled={busyId === r.id} onClick={() => act(r.id, "remove")} className={`${btn} border-brand-300 text-brand-700 hover:bg-brand-100`}>
                        {t("remove")}
                      </button>
                    </>,
                  ),
                )}
              </ul>
            )}
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold text-brand-900/80">{t("upNext", { count: q.upNext.length })}</h3>
          {q.upNext.length === 0 ? (
            <p className="mt-1 text-sm text-brand-900/50">{t("noneNext")}</p>
          ) : (
            <ul className="mt-1 space-y-2">
              {q.upNext.map((r, i) =>
                row(
                  r,
                  <>
                    {i > 0 && (
                      <button type="button" disabled={busyId === r.id} onClick={() => act(r.id, "top")} className={`${btn} border-brand-300 text-brand-700 hover:bg-brand-100`}>
                        {t("toTop")}
                      </button>
                    )}
                    <button type="button" disabled={busyId === r.id} onClick={() => act(r.id, "remove")} className={`${btn} border-brand-300 text-brand-700 hover:bg-brand-100`}>
                      {t("remove")}
                    </button>
                  </>,
                ),
              )}
            </ul>
          )}
        </div>

        {q.history.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-brand-900/70">{t("history", { count: q.history.length })}</summary>
            <ul className="mt-2 space-y-2">
              {q.history.map((r) =>
                row(r, <span className="text-xs text-brand-900/55">{t(`status_${r.status}`)}</span>),
              )}
            </ul>
          </details>
        )}
        <p className="text-xs text-brand-900/55">{t("queueHint")}</p>
      </section>

      <section className="space-y-4 rounded-2xl border border-brand-200 p-4">
        <h2 className="font-bold text-brand-900">② {t("rules")}</h2>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-brand-900/80">{t("minAmount")}</span>
          <AutoSaveInput
            value={String(data.minAmount)}
            ariaLabel={t("minAmount")}
            inputMode="numeric"
            className="w-28!"
            save={(v) => {
              const n = Number(v);
              if (!Number.isInteger(n) || n < 1 || n > 100_000) return Promise.resolve(false);
              return save({ minAmount: n });
            }}
          />
          <span className="mt-1 block text-xs text-brand-900/55">{t("minAmountHint")}</span>
        </label>

        <div>
          <span className="mb-1 block text-sm font-medium text-brand-900/80">{t("maxLength")}</span>
          <div className="inline-flex flex-wrap overflow-hidden rounded-full border border-brand-300" role="radiogroup" aria-label={t("maxLength")}>
            {MEDIA_MAX_SEC_CHOICES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={data.maxSec === s}
                onClick={() => data.maxSec !== s && void save({ maxSec: s })}
                className={`px-3.5 py-1.5 text-sm font-semibold ${data.maxSec === s ? "bg-brand-600 text-white" : "text-brand-800 hover:bg-brand-100"}`}
              >
                {t("minutes", { n: s / 60 })}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-xl bg-brand-50 p-3">
          <div>
            <p className="text-sm font-semibold text-brand-900">{t("autoApprove")}</p>
            <p className="text-xs text-brand-900/60">{t("autoApproveHint")}</p>
          </div>
          <Switch checked={data.autoApprove} onChange={setAuto} label={t("autoApprove")} />
        </div>

        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-medium text-brand-900/80">
            <Icon name="volume" className="h-4 w-4" />
            {t("volume", { n: volume ?? data.volume })}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={volume ?? data.volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            className="w-full max-w-xs accent-brand-600"
            aria-label={t("volumeLabel")}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-2xl border border-brand-200 p-4">
        <h2 className="font-bold text-brand-900">③ {t("obsAndColor")}</h2>
        {obsUrl && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
            >
              <Icon name="link" className="h-3.5 w-3.5" />
              {copied ? tHub("copied") : tHub("copyObs")}
            </button>
            <span className="text-xs text-brand-900/50">{tHub("obsSizeOf", { size: "640×480" })}</span>
          </p>
        )}
        <p className="text-xs text-brand-900/55">{t("obsAudioHint")}</p>
        <div className="rounded-xl bg-brand-50 p-3">
          <ColorField
            value={data.color}
            fallback={data.alertColor ?? DEFAULT_COLOR}
            presets={PRESET_COLORS}
            label={t("color")}
            codeLabel={t("colorCode")}
            resetLabel={t("colorReset")}
            defaultLabel={t("colorDefault")}
            onSave={(hex) => void save({ color: hex })}
            onReset={() => void save({ color: null })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={testOnObs} className="btn-primary px-4 py-2 text-sm">
            {t("testOnObs")}
          </button>
          {test && (
            <span className={`text-xs ${test === "sent" ? "text-emerald-700" : "text-red-600"}`}>
              {test === "sent" ? (data.enabled && !data.paused ? t("testSent") : t("testWaits")) : t("saveFailed")}
            </span>
          )}
        </div>
      </section>

      {warnOpen && (
        <Modal label={t("warnTitle")}>
          <h2 className="text-lg font-extrabold text-brand-900">{t("warnTitle")}</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-brand-900/80">
            {WARNINGS.map((w) => (
              <li key={w}>{t(w)}</li>
            ))}
          </ul>
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-xl border border-brand-200 p-3 text-sm font-semibold text-brand-900">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
            />
            {t("warnAccept")}
          </label>
          {ackFailed && <p className="mt-2 text-sm font-medium text-red-600">{t("saveFailed")}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setWarnOpen(false)} className="btn-secondary px-4 py-2 text-sm">
              {tc("cancel")}
            </button>
            <button
              type="button"
              disabled={!understood || acking}
              onClick={async () => {
                setAcking(true);
                setAckFailed(false);
                const ok = await save({ autoApprove: true, ack: true });
                setAcking(false);
                if (ok) setWarnOpen(false);
                else setAckFailed(true);
              }}
              className="btn-primary px-4 py-2 text-sm"
            >
              {t("warnConfirm")}
            </button>
          </div>
        </Modal>
      )}
    </FeatureSettingsLayout>
  );
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
