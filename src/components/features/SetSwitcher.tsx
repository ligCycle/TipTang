"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { useSoundSets } from "@/components/features/useSoundSets";

/**
 * "ชุดเสียงไลฟ์วันนี้ [ชุด ▾]": switch the stream's sound set in one tap
 * (hub, dashboard home, alerts page). Saves on change.
 */
export function SetSwitcher({ showManage = false }: { showManage?: boolean }) {
  const t = useTranslations("featureHub");
  const locale = useLocale();
  const { sets, activeSetId, activate } = useSoundSets();
  if (!sets || !activeSetId) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border-2 border-brand-300 bg-brand-50 p-3">
      <Icon name="volume" className="h-5 w-5 shrink-0 text-brand-700" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-brand-900">{t("switchTitle")}</span>
        <span className="block text-xs text-brand-900/60">{t("switchHint")}</span>
      </span>
      <select
        value={activeSetId}
        onChange={(e) => void activate(e.target.value)}
        aria-label={t("switchTitle")}
        className="input w-auto! py-1.5 text-sm font-semibold"
      >
        {sets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {showManage && (
        <Link href={`/${locale}/dashboard/library`} className="text-sm font-semibold text-brand-700 hover:underline">
          {t("switchManage")}
        </Link>
      )}
    </div>
  );
}
