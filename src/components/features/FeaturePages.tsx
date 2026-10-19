"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { OverlaySettings } from "@/components/OverlaySettings";
import { AlertPreview } from "@/components/features/AlertPreview";
import { PositionPicker } from "@/components/features/PositionPicker";
import { Switch } from "@/components/features/FeatureCard";
import { AlertTiersSection } from "@/components/features/AlertTiersSection";
import type { AlertTier } from "@/lib/alert-tiers";
import type { OnScreenFeature } from "@/lib/overlay-layout";

type Layout = {
  positions: Record<OnScreenFeature, string>;
  enabled: Record<OnScreenFeature, boolean>;
};

/** Header shared by every feature settings page: back to the hub, title, switch. */
export function FeatureSettingsLayout({
  title,
  enabled,
  toggleKind,
  children,
}: {
  title: string;
  /** With a toggle kind, the header carries the feature's on/off switch. */
  enabled?: boolean;
  toggleKind?: "alertsToggle";
  children: ReactNode;
}) {
  const t = useTranslations("featureHub");
  const locale = useLocale();
  const [on, setOn] = useState(Boolean(enabled));
  const [busy, setBusy] = useState(false);

  async function toggle(next: boolean) {
    if (!toggleKind) return;
    setOn(next);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kind", toggleKind);
      fd.append("enabled", next ? "1" : "0");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
    } catch {
      setOn(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/${locale}/dashboard/features`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        ← {t("back")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-brand-900">{title}</h1>
        {toggleKind && (
          <span className="flex items-center gap-2 text-sm font-semibold text-brand-900/75">
            {t("enable")}
            <Switch checked={on} onChange={toggle} label={title} disabled={busy} />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function AlertsFeature({ alertsEnabled, layout }: { alertsEnabled: boolean; layout: Layout }) {
  const t = useTranslations("featureHub");
  // Saved tiers, shared between the tiers editor and the preview.
  const [tiers, setTiers] = useState<AlertTier[]>([]);
  return (
    <FeatureSettingsLayout title={t("f_alerts")} enabled={alertsEnabled} toggleKind="alertsToggle">
      <OverlaySettings
        view="alerts"
        aside={(config) => <AlertPreview config={config} tiers={tiers} />}
        positionSlot={<PositionPicker feature="alert" {...layout} />}
        tiersSlot={(config) => <AlertTiersSection config={config} onSaved={setTiers} />}
      />
    </FeatureSettingsLayout>
  );
}

export function GoalFeature({ layout }: { layout: Layout }) {
  const t = useTranslations("featureHub");
  return (
    <FeatureSettingsLayout title={t("f_goal")}>
      <OverlaySettings view="goal" positionSlot={<PositionPicker feature="goal" {...layout} />} />
    </FeatureSettingsLayout>
  );
}

export function SubathonFeature({ layout }: { layout: Layout }) {
  const t = useTranslations("featureHub");
  return (
    <FeatureSettingsLayout title={t("f_subathon")}>
      <OverlaySettings view="subathon" positionSlot={<PositionPicker feature="timer" {...layout} />} />
    </FeatureSettingsLayout>
  );
}
