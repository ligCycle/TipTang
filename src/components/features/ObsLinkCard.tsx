"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { OverlayConnectionStatus } from "@/components/OverlayConnectionStatus";

/**
 * Top of the hub: how OBS works here (one browser source per feature, placed
 * and sized freely by the creator) and whether any of them is connected.
 */
export function ObsLinkCard({ lastSeenAt }: { lastSeenAt: string | null }) {
  const t = useTranslations("featureHub");
  return (
    <section className="rounded-2xl border-2 border-brand-400 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Icon name="monitor" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-brand-900">{t("obsTitle")}</h2>
          <p className="text-sm text-brand-900/65">{t("obsLine")}</p>
          <p className="text-xs text-brand-900/50">{t("obsSize")}</p>
        </div>
      </div>
      <div className="mt-3">
        <OverlayConnectionStatus initialLastSeenAt={lastSeenAt} />
      </div>
    </section>
  );
}
