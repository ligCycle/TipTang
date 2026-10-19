"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";

export type SoundChoice = { id: string; name: string; url: string; minAmount: number };

/**
 * The tip a sound needs: its own minimum plus `addOn` (the spin price when
 * the fan also spins the wheel — prices add up), never below the creator's.
 */
export function soundFloor(choice: SoundChoice, creatorMin: number, addOn = 0): number {
  return Math.max(creatorMin, addOn + choice.minAmount);
}

/**
 * Donate page: pick a sound from the creator's set of the day to play with
 * the tip on stream. A sound the entered amount doesn't cover can't be
 * picked — the amount is never raised for the fan.
 */
export function SoundPicker({
  choices,
  setName,
  amount,
  creatorMin,
  addOn = 0,
  value,
  onChange,
}: {
  choices: SoundChoice[];
  setName: string;
  amount: number;
  creatorMin: number;
  /** Price of other picks in the same tip (the wheel spin). */
  addOn?: number;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const t = useTranslations("profile");
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  function preview(c: SoundChoice) {
    audio.current?.pause();
    if (playing === c.id) {
      setPlaying(null);
      return;
    }
    const a = new Audio(c.url);
    audio.current = a;
    setPlaying(c.id);
    a.addEventListener("ended", () => setPlaying((p) => (p === c.id ? null : p)), { once: true });
    a.play().catch(() => setPlaying(null));
  }

  return (
    <fieldset>
      <legend className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-brand-900/80">
        {t("soundPickLabel")}
        <span className="rounded-full bg-brand-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-brand-100 dark:text-brand-900">
          {t("soundPickSet", { name: setName })}
        </span>
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {choices.map((c) => {
          const floor = soundFloor(c, creatorMin, addOn);
          const locked = amount < floor;
          const selected = value === c.id;
          return (
            <div
              key={c.id}
              className={`flex items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-sm transition ${
                selected
                  ? "border-brand-500 bg-brand-100 ring-2 ring-brand-400/40"
                  : locked
                    ? "border-brand-100 opacity-50"
                    : "border-brand-200"
              }`}
            >
              <button
                type="button"
                onClick={() => preview(c)}
                aria-label={t("soundPreview", { name: c.name })}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700"
              >
                <Icon name={playing === c.id ? "x" : "play"} className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() => onChange(selected ? null : c.id)}
                className="flex min-w-0 flex-1 items-center justify-between gap-1 text-left disabled:cursor-not-allowed"
              >
                <span className="flex min-w-0 items-center gap-1 font-semibold text-brand-900">
                  {selected && <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="shrink-0 text-xs font-bold text-tip-600">
                  {locked
                    ? t("soundLocked", { min: floor })
                    : c.minAmount > 0
                      ? `฿${c.minAmount.toLocaleString()}`
                      : t("soundFree")}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-brand-900/55">{t("soundPickHint")}</p>
    </fieldset>
  );
}
