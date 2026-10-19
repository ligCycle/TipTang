"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";

export type WheelChoice = {
  id: string;
  name: string;
  price: number;
  /** Tasks with segments left, and how many each has. */
  odds: { taskId: string; text: string; remaining: number }[];
};

/**
 * Donate page: "หมุนวงล้อ" as a checkbox card. `floor` is the tip needed with
 * the spin (creator minimum, spin price and any picked sound). It can't be
 * ticked below that — the amount is never raised for the fan. Every task is
 * listed with its segment count; all segments have equal odds.
 */
export function WheelPicker({
  wheel,
  amount,
  floor,
  checked,
  onChange,
}: {
  wheel: WheelChoice;
  amount: number;
  floor: number;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("profile");
  const [open, setOpen] = useState(false);
  const locked = !checked && amount < floor;
  const segments = wheel.odds.reduce((n, o) => n + o.remaining, 0);

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
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-brand-600"
        />
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
          <Icon name="wheel" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-brand-900">{t("wheelSpin", { name: wheel.name })}</span>
          <span className="block text-xs text-brand-900/60">{t("wheelResultOnStream")}</span>
        </span>
        <span className="shrink-0 text-xs font-bold text-tip-600">
          {locked ? t("soundLocked", { min: floor }) : `฿${wheel.price.toLocaleString()}`}
        </span>
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1.5 text-xs font-semibold text-brand-700 underline underline-offset-2"
      >
        {t("wheelSeeSlots", { count: segments })}
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl border border-brand-200 p-3 text-sm">
          <ul className="space-y-0.5">
            {wheel.odds.map((o) => (
              <li key={o.taskId} className="flex justify-between gap-3 text-brand-900">
                <span className="min-w-0">{o.text}</span>
                <span className="shrink-0 text-xs text-brand-900/60">{t("wheelSlotCount", { count: o.remaining })}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-brand-900/60">{t("wheelEqualOdds")}</p>
        </div>
      )}
    </div>
  );
}
