"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";

export type VoicePick = { blob: Blob; url: string; type: string; sec: number };

/** Recorder formats in order (R2): Chrome/Edge/Android, iPhone, Firefox. */
const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"];
const MIN_MS = 1000;
/** Apps whose built-in browser often can't use the microphone. */
const IN_APP = /Line\/|FBAN|FBAV|Instagram|musical_ly|BytedanceWebview/i;

type Problem = "denied" | "nodevice" | "unsupported" | "short" | null;

function canRecord(): boolean {
  return typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

/**
 * Donate page, "ฝากเสียง": record a short voice message (up to `maxSec`),
 * listen back, record again or delete. The recording lives with the form
 * (`value`), so it survives the pay step. While recording, `onUnsettled(true)`
 * makes "continue" wait; it stops the recording and keeps it.
 */
export function VoiceRecorder({
  value,
  onChange,
  onUnsettled,
  maxSec,
  stopSignal,
}: {
  value: VoicePick | null;
  onChange: (next: VoicePick | null) => void;
  onUnsettled: (unsettled: boolean) => void;
  maxSec: number;
  /** Bumped by the form to stop a recording in progress (it is kept). */
  stopSignal: number;
}) {
  const t = useTranslations("profile");
  const [recording, setRecording] = useState(false);
  const [left, setLeft] = useState(maxSec);
  const [problem, setProblem] = useState<Problem>(null);
  const [copied, setCopied] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const supported = canRecord();
  const inApp = typeof navigator !== "undefined" && IN_APP.test(navigator.userAgent);

  useLayoutEffect(() => {
    onUnsettled(recording);
    return () => onUnsettled(false);
  }, [recording, onUnsettled]);

  function release() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    // iPhone keeps the mic light on (and audio in the earpiece) until every track stops.
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
  }

  function stop() {
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
  }

  useEffect(() => {
    if (stopSignal > 0) stop();
  }, [stopSignal]);

  useEffect(() => () => {
    stop();
    release();
  }, []);

  async function start() {
    setProblem(null);
    if (!supported) return setProblem("unsupported");
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      return setProblem(name === "NotFoundError" || name === "OverconstrainedError" ? "nodevice" : name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
    }
    stream.current = media;
    const type = TYPES.find((ty) => MediaRecorder.isTypeSupported?.(ty));
    let r: MediaRecorder;
    try {
      r = type ? new MediaRecorder(media, { mimeType: type, audioBitsPerSecond: 64000 }) : new MediaRecorder(media);
    } catch {
      release();
      return setProblem("unsupported");
    }
    const chunks: Blob[] = [];
    const began = Date.now();
    r.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    r.onstop = () => {
      release();
      setRecording(false);
      const ms = Date.now() - began;
      if (ms < MIN_MS || chunks.length === 0) return setProblem("short");
      const mime = r.mimeType || type || "audio/webm";
      const blob = new Blob(chunks, { type: mime });
      onChange({ blob, url: URL.createObjectURL(blob), type: mime, sec: Math.min(maxSec, Math.max(1, Math.round(ms / 1000))) });
    };
    rec.current = r;
    if (value) URL.revokeObjectURL(value.url);
    onChange(null);
    r.start(250);
    setRecording(true);
    setLeft(maxSec);
    timer.current = setInterval(() => {
      const remaining = maxSec - Math.floor((Date.now() - began) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) stop();
    }, 250);
  }

  function remove() {
    if (value) URL.revokeObjectURL(value.url);
    onChange(null);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  const lineLink = (() => {
    if (typeof window === "undefined") return null;
    const u = new URL(window.location.href);
    u.searchParams.set("openExternalBrowser", "1");
    return u.toString();
  })();

  return (
    <div className="space-y-2 rounded-xl border border-brand-200 p-3">
      {!value && !recording && (
        <button type="button" onClick={start} className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm">
          <Icon name="mic" className="h-4 w-4" />
          {t("voiceRecord", { sec: maxSec })}
        </button>
      )}
      {recording && (
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" aria-hidden />
          <span className="text-sm font-semibold text-brand-900" role="status">
            {t("voiceRecording", { sec: left })}
          </span>
          <button type="button" onClick={stop} className="btn-primary px-3 py-1.5 text-sm">
            {t("voiceStop")}
          </button>
        </div>
      )}
      {value && !recording && (
        <div className="space-y-2">
          <audio src={value.url} controls className="h-9 w-full" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={start} className="btn-secondary px-3 py-1.5 text-xs">
              {t("voiceRedo")}
            </button>
            <button type="button" onClick={remove} className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100">
              {t("voiceDelete")}
            </button>
            <span className="self-center text-xs text-brand-900/60">{t("voiceLength", { sec: value.sec })}</span>
          </div>
        </div>
      )}
      {problem && (
        <div className="space-y-1.5 text-xs font-medium text-amber-700 dark:text-amber-400" role="status">
          <p>{t(problem === "short" ? "voiceTooShort" : inApp ? "voiceInApp" : `voice_${problem}`)}</p>
          {problem !== "short" && inApp && (
            <p className="flex flex-wrap gap-2">
              <button type="button" onClick={copyLink} className="rounded-full border border-amber-400 px-2.5 py-1">
                {copied ? t("voiceCopied") : t("voiceCopyLink")}
              </button>
              {/Line\//i.test(navigator.userAgent) && lineLink && (
                <a href={lineLink} className="rounded-full border border-amber-400 px-2.5 py-1">
                  {t("voiceOpenBrowser")}
                </a>
              )}
            </p>
          )}
        </div>
      )}
      <p className="text-xs text-brand-900/55">{t("voiceFinePrint", { sec: maxSec })}</p>
    </div>
  );
}

export type VoiceChoice = { minAmount: number; maxSec: number };

/**
 * "ฝากเสียง" as a checkbox card (like the clip card). `floor` is the tip
 * needed with the voice on top of the other picked extras; it can't be
 * ticked below that — the amount is never raised for the fan.
 */
export function VoicePicker({
  choice,
  amount,
  floor,
  checked,
  onCheck,
  value,
  onChange,
  onUnsettled,
  stopSignal,
}: {
  choice: VoiceChoice;
  amount: number;
  floor: number;
  checked: boolean;
  onCheck: (next: boolean) => void;
  value: VoicePick | null;
  onChange: (next: VoicePick | null) => void;
  onUnsettled: (unsettled: boolean) => void;
  stopSignal: number;
}) {
  const t = useTranslations("profile");
  const locked = !checked && amount < floor;
  return (
    <div>
      <label
        className={`flex items-center gap-3 rounded-xl border-2 p-3 text-sm transition ${
          checked
            ? "cursor-pointer border-brand-500 bg-brand-100 ring-2 ring-brand-400/40"
            : locked
              ? "cursor-not-allowed border-brand-100 opacity-60"
              : "cursor-pointer border-brand-200"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={(e) => onCheck(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-brand-600"
        />
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
          <Icon name="mic" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-brand-900">{t("voiceOption")}</span>
          <span className="block text-xs text-brand-900/60">{t("voiceOptionHint")}</span>
        </span>
        <span className="shrink-0 text-xs font-bold text-tip-600">
          {locked ? t("soundLocked", { min: floor }) : `฿${choice.minAmount.toLocaleString()}`}
        </span>
      </label>
      {checked && (
        <div className="mt-2">
          <VoiceRecorder value={value} onChange={onChange} onUnsettled={onUnsettled} maxSec={choice.maxSec} stopSignal={stopSignal} />
        </div>
      )}
    </div>
  );
}
