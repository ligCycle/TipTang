"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { mainItem } from "@/lib/wishlist";

export type WishChoiceItem = { id: string; name: string; price: number; raised: number; imageUrl: string | null; full: boolean };

/**
 * Donate page, goal "หลายชิ้น": which item this tip helps (optional). "ไม่เลือก"
 * says where the tip goes instead (the main item); full items can't be picked.
 */
export function WishPicker({
  items,
  value,
  onChange,
}: {
  items: WishChoiceItem[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const t = useTranslations("profile");
  const main = mainItem(items);
  const row = (selected: boolean, disabled = false) =>
    `flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-left text-sm transition ${
      selected
        ? "border-brand-500 bg-brand-100 ring-2 ring-brand-400/40"
        : disabled
          ? "cursor-not-allowed border-brand-100 opacity-50"
          : "border-brand-200 hover:border-brand-400"
    }`;
  const dot = (selected: boolean) => (
    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-brand-600" : "border-brand-300"}`}>
      {selected && <span className="h-2 w-2 rounded-full bg-brand-600" />}
    </span>
  );

  return (
    <fieldset>
      <legend className="mb-2 block text-sm font-medium text-brand-900/80">{t("wishLabel")}</legend>
      <div className="space-y-1.5" role="radiogroup">
        <button type="button" role="radio" aria-checked={value === null} onClick={() => onChange(null)} className={row(value === null)}>
          {dot(value === null)}
          <span className="min-w-0">
            <span className="block font-semibold text-brand-900">{t("wishNone")}</span>
            {main && <span className="block text-xs text-brand-900/60">{t("wishNoneHint", { name: main.name })}</span>}
          </span>
        </button>
        {items.map((i) => {
          const selected = value === i.id;
          const pct = Math.min(100, i.price > 0 ? Math.round((i.raised / i.price) * 100) : 0);
          return (
            <button key={i.id} type="button" role="radio" aria-checked={selected} disabled={i.full}
              onClick={() => onChange(selected ? null : i.id)} className={row(selected, i.full)}>
              {dot(selected)}
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-100 text-brand-700">
                {i.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="target" className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold text-brand-900">{i.name}</span>
                  <span className={`shrink-0 text-xs ${i.full ? "font-bold text-emerald-600" : "text-brand-900/60"}`}>
                    {i.full ? t("wishFull") : `฿${i.raised.toLocaleString()} / ฿${i.price.toLocaleString()}`}
                  </span>
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-brand-100">
                  <span className={`block h-full rounded-full ${i.full ? "bg-emerald-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
