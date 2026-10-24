"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import type { Odds, Rarity } from "@/lib/gacha";

export type GachaChoice = {
  version: number;
  price: number;
  odds: Odds;
  tiers: { rarity: Rarity; prizes: string[] }[];
};

const RARITY_COLOR: Record<Rarity, string> = { common: "#94a3b8", rare: "#8b5cf6", epic: "#f59e0b" };

/**
 * Donate page: "สุ่มกาชา" as a checkbox card. `floor` is the tip needed with
 * the pull on top of the other picked extras; it can't be ticked below that
 * (the amount is never raised). "ดูโอกาส" lists every rarity's odds and its
 * prizes — fans always see the odds before they pay.
 */
export function GachaPicker({
  gacha,
  amount,
  floor,
  checked,
  onChange,
}: {
  gacha: GachaChoice;
  amount: number;
  floor: number;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useTranslations("profile");
  const [open, setOpen] = useState(false);
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
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 shrink-0 accent-brand-600"
        />
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
          <Icon name="gift" className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-brand-900">{t("gachaPull")}</span>
          <span className="block text-xs text-brand-900/60">{t("gachaPullHint")}</span>
        </span>
        <span className="shrink-0 text-xs font-bold text-tip-600">
          {locked ? t("soundLocked", { min: floor }) : `฿${gacha.price.toLocaleString()}`}
        </span>
      </label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-1.5 text-xs font-semibold text-brand-700 underline underline-offset-2"
      >
        {t("gachaSeeOdds")}
      </button>
      {open && (
        <div className="mt-1.5 space-y-2 rounded-xl border border-brand-200 p-3 text-sm">
          {gacha.tiers.map((tier) => (
            <div key={tier.rarity}>
              <p className="flex items-center justify-between font-semibold" style={{ color: RARITY_COLOR[tier.rarity] }}>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: RARITY_COLOR[tier.rarity] }} />
                  {t(`gacha_${tier.rarity}`)}
                </span>
                <span>{gacha.odds[tier.rarity]}%</span>
              </p>
              {tier.prizes.length > 0 ? (
                <p className="text-xs text-brand-900/70">{tier.prizes.join(" · ")}</p>
              ) : (
                <p className="text-xs text-brand-900/45">{t("gachaNoPrize")}</p>
              )}
            </div>
          ))}
          <p className="text-xs text-brand-900/55">{t("gachaOddsNote")}</p>
        </div>
      )}
    </div>
  );
}
