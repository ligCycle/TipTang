"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { parseYouTube } from "@/lib/media";

export type MediaChoice = { minAmount: number; maxSec: number };
export type ClipPick = { videoId: string; startSec: number; title: string | null; thumb: string };

/**
 * Donate page, "สื่อจากแฟน": attach a YouTube clip to the tip ("ขอคลิป/เพลง").
 * The link is checked as soon as it's pasted or the field is left, and the fan
 * sees what will play. `floor` is the tip needed with the clip (creator
 * minimum + clip + other picked extras); it can't be ticked below that.
 * Only the video ID and start go to the server, never the link itself.
 */
export function MediaPicker({
  username,
  choice,
  amount,
  floor,
  value,
  onChange,
}: {
  username: string;
  choice: MediaChoice;
  amount: number;
  floor: number;
  value: ClipPick | null;
  onChange: (next: ClipPick | null) => void;
}) {
  const t = useTranslations("profile");
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "bad" | "gone" | "failed">("idle");
  const asked = useRef("");
  const checked = open || value !== null;
  const locked = !checked && amount < floor;

  async function check(text: string) {
    const trimmed = text.trim();
    if (trimmed === asked.current) return;
    asked.current = trimmed;
    onChange(null);
    if (trimmed === "") return setStatus("idle");
    if (!parseYouTube(trimmed)) return setStatus("bad");
    setStatus("checking");
    const res = await fetch(`/api/media/preview?u=${encodeURIComponent(username)}&url=${encodeURIComponent(trimmed)}`).catch(
      () => null,
    );
    if (asked.current !== trimmed) return;
    if (!res) return setStatus("failed");
    if (res.ok) {
      onChange((await res.json()) as ClipPick);
      setStatus("idle");
    } else setStatus(res.status === 422 ? "gone" : res.status === 400 ? "bad" : "failed");
  }

  function toggle(next: boolean) {
    setOpen(next);
    if (!next) {
      onChange(null);
      setLink("");
      setStatus("idle");
      asked.current = "";
    }
  }

  const minutes = Math.round(choice.maxSec / 60);

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
          onChange={(e) => toggle(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-brand-600"
        />
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
          <Icon name="music" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-brand-900">{t("mediaClip")}</span>
          <span className="block text-xs text-brand-900/60">{t("mediaClipHint")}</span>
        </span>
        <span className="shrink-0 text-xs font-bold text-tip-600">
          {locked ? t("soundLocked", { min: floor }) : `฿${choice.minAmount.toLocaleString()}`}
        </span>
      </label>

      {checked && (
        <div className="mt-2 space-y-2 rounded-xl border border-brand-200 p-3">
          <input
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onBlur={(e) => void check(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              // Let the paste land in the field, then check what is there.
              setTimeout(() => void check(text), 0);
            }}
            placeholder={t("mediaLinkPlaceholder")}
            aria-label={t("mediaLinkLabel")}
            className="input w-full"
            maxLength={500}
          />
          {status === "checking" && <p className="text-xs text-brand-900/60">{t("mediaChecking")}</p>}
          {status === "bad" && <p className="text-xs font-medium text-red-600">{t("mediaBadLink")}</p>}
          {status === "gone" && <p className="text-xs font-medium text-red-600">{t("mediaGone")}</p>}
          {status === "failed" && <p className="text-xs font-medium text-red-600">{t("mediaCheckFailed")}</p>}
          {value && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value.thumb} alt="" className="h-14 w-24 shrink-0 rounded-lg bg-brand-100 object-cover" />
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-semibold text-brand-900">{value.title ?? t("mediaUntitled")}</p>
                {value.startSec > 0 && (
                  <p className="text-xs text-brand-900/60">
                    {t("mediaStartsAt", { time: `${Math.floor(value.startSec / 60)}:${String(value.startSec % 60).padStart(2, "0")}` })}
                  </p>
                )}
              </div>
            </div>
          )}
          <p className="text-xs text-brand-900/55">{t("mediaFinePrint", { minutes })}</p>
        </div>
      )}
    </div>
  );
}
