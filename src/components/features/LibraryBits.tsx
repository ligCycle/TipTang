"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import type { AlertTier } from "@/lib/alert-tiers";

/** Shared pieces of the library page, its set editor and the create-set window. */

export type FileKind = "sound" | "image" | "video";
export type LibFile = { id: string; url: string; name: string | null; kind: FileKind; n: number };
export type SetItem = { assetId: string; fanPickable: boolean; minAmount: number };
export type SoundSet = { id: string; name: string; items: SetItem[] };
export type LibraryData = { files: LibFile[]; tiers: AlertTier[]; sets: SoundSet[]; activeSetId: string };

const UPLOAD_KIND: Record<FileKind, string> = {
  sound: "librarySound",
  image: "librarySticker",
  video: "libraryVideo",
};

type Raw = { id: string; url: string; name?: string | null };

export async function fetchLibrary(): Promise<LibraryData> {
  const [setup, tierRes, setRes] = await Promise.all([
    fetch("/api/overlay/setup", { method: "POST" }).then((r) => r.json()),
    fetch("/api/overlay/tiers").then((r) => r.json()),
    fetch("/api/overlay/sets").then((r) => r.json()),
  ]);
  const map = (list: Raw[] | undefined, kind: FileKind): LibFile[] =>
    (list ?? []).map((a, i) => ({ id: a.id, url: a.url, name: a.name ?? null, kind, n: i + 1 }));
  return {
    files: [
      ...map(setup.libraryStickers, "image"),
      ...map(setup.librarySounds, "sound"),
      ...map(setup.libraryVideos, "video"),
    ],
    tiers: tierRes.tiers ?? [],
    sets: setRes.sets ?? [],
    activeSetId: setRes.activeSetId ?? "",
  };
}

export function kindOf(file: File): FileKind {
  if (file.type.startsWith("audio/")) return "sound";
  if (file.type.startsWith("video/")) return "video";
  return "image";
}

/** Upload into the library; `addToActive` also puts sounds/images in today's set. */
export async function uploadFile(
  file: File,
  addToActive: boolean,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const fd = new FormData();
  fd.append("kind", UPLOAD_KIND[kindOf(file)]);
  fd.append("file", file);
  if (addToActive) fd.append("addToActive", "1");
  const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
  const d = await res.json().catch(() => ({}));
  return res.ok && typeof d.id === "string" ? { ok: true, id: d.id } : { ok: false, error: String(d.error ?? "") };
}

export async function removeFile(f: LibFile): Promise<void> {
  const fd = new FormData();
  fd.append("kind", UPLOAD_KIND[f.kind]);
  fd.append("remove", "1");
  fd.append("assetId", f.id);
  await fetch("/api/overlay/asset", { method: "POST", body: fd });
}

export async function patchSet(id: string, body: Record<string, unknown>): Promise<Response> {
  return fetch(`/api/overlay/sets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** "เสียง 2" etc. for files the creator hasn't named. */
export function useFileLabel() {
  const t = useTranslations("featureHub");
  return (f: LibFile) =>
    f.name ?? t(f.kind === "sound" ? "tierSoundN" : f.kind === "video" ? "tierVideoN" : "tierImageN", { n: f.n });
}

/** Upload error text for an API error code. */
export function useUploadError() {
  const t = useTranslations("featureHub");
  return (code: string) => {
    const key = `tierUpErr_${code}`;
    return t.has(key) ? t(key) : t("tierUpErr");
  };
}

/** A file's preview: thumbnail, video, or a play button for sounds. */
export function FileThumb({ file, label, small = false }: { file: LibFile; label: string; small?: boolean }) {
  const t = useTranslations("featureHub");
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0b1220] ${
        small ? "h-11 w-11" : "h-28 w-full"
      }`}
    >
      {file.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt={label} className="max-h-full max-w-full object-contain" />
      ) : file.kind === "video" ? (
        small ? (
          <Icon name="video" className="h-5 w-5 text-white/80" />
        ) : (
          <video src={file.url} controls preload="metadata" className="max-h-full max-w-full" />
        )
      ) : (
        <button
          type="button"
          onClick={() => void new Audio(file.url).play().catch(() => {})}
          className="flex flex-col items-center gap-1 text-white/85 hover:text-white"
          aria-label={`${t("libPlay")} ${label}`}
        >
          <Icon name="play" className={small ? "h-5 w-5" : "h-9 w-9"} />
          {!small && <span className="text-xs font-semibold">{t("libPlay")}</span>}
        </button>
      )}
    </div>
  );
}

const SAVE_DELAY_MS = 800;

/**
 * A text box that saves by itself shortly after typing stops. `save` returns
 * whether it worked; invalid input (e.g. empty) is simply not saved.
 */
export function AutoSaveInput({
  value,
  save,
  ariaLabel,
  placeholder,
  inputMode,
  maxLength,
  className = "",
}: {
  value: string;
  save: (next: string) => Promise<boolean>;
  ariaLabel: string;
  placeholder?: string;
  inputMode?: "numeric";
  maxLength?: number;
  className?: string;
}) {
  const t = useTranslations("featureHub");
  const [text, setText] = useState(value);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function change(next: string) {
    setText(next);
    setState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const ok = await save(next);
      setState(ok ? "saved" : "error");
    }, SAVE_DELAY_MS);
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <input
        value={text}
        onChange={(e) => change(e.target.value)}
        aria-label={ariaLabel}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        className="input w-full! py-1.5 text-sm"
      />
      {state === "saved" && <Icon name="check" className="h-4 w-4 shrink-0 text-emerald-600" aria-label={t("tierSaved")} />}
      {state === "error" && <Icon name="alert-triangle" className="h-4 w-4 shrink-0 text-red-600" aria-label={t("saveInvalid")} />}
    </span>
  );
}
