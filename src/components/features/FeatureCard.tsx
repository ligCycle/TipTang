"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import type { FeatureDef } from "@/lib/feature-registry";

/** On/off switch, same look as the switches on the settings pages. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
        checked ? "bg-brand-600" : "bg-brand-900/25"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

/** One feature on the hub: icon, name, one line, switch, and its settings link. */
export function FeatureCard({
  feature,
  enabled,
  busy,
  onToggle,
}: {
  feature: FeatureDef;
  enabled: boolean;
  busy?: boolean;
  onToggle: (next: boolean) => void;
}) {
  const t = useTranslations("featureHub");
  const locale = useLocale();
  const name = t(`f_${feature.id}`);

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border p-4 ${
        enabled ? "border-brand-400 bg-brand-50/60" : "border-brand-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Icon name={feature.icon} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 font-bold text-brand-900">{name}</span>
        <Switch checked={enabled} onChange={onToggle} label={name} disabled={busy} />
      </div>
      <p className="text-sm text-brand-900/65">{t(`d_${feature.id}`)}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="flex flex-wrap gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
              enabled ? "bg-brand-100 text-brand-700" : "bg-brand-900/10 text-brand-900/60"
            }`}
          >
            {enabled ? t("on") : t("off")}
          </span>
          {feature.fanPage && (
            <span className="rounded-full bg-tip-100 px-2 py-0.5 text-xs font-semibold text-tip-700">
              {t("fanTag")}
            </span>
          )}
        </span>
        <Link
          href={`/${locale}${feature.href}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
        >
          {t("settings")}
          <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
