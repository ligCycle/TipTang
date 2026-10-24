"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { OverlaySettings } from "@/components/OverlaySettings";
import { AlertPreview } from "@/components/features/AlertPreview";
import { Switch } from "@/components/features/FeatureCard";
import { AlertTiersSection } from "@/components/features/AlertTiersSection";
import { GoalPage } from "@/components/features/GoalPage";
import type { AlertTier } from "@/lib/alert-tiers";
import { ObsBar } from "@/components/features/ObsBar";
import type { FeatureId } from "@/lib/feature-registry";

/** The OBS bar under the title: which link, its status, and the page's test. */
export type ObsBarProps = { feature: FeatureId; onTest?: () => void; testState?: "sent" | "failed" | null };

/**
 * Header shared by every feature settings page: back to the hub, title,
 * switch, then the OBS bar — the same order on every page.
 */
export function FeatureSettingsLayout({
  title,
  enabled,
  toggleKind,
  headerExtra,
  obs,
  children,
}: {
  title: string;
  obs?: ObsBarProps;
  /** With a toggle kind, the header carries the feature's on/off switch. */
  enabled?: boolean;
  toggleKind?: "alertsToggle";
  /** Header right side for pages that run their own switch (e.g. the wheel's rules check). */
  headerExtra?: ReactNode;
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
        {headerExtra}
      </div>
      {obs && <ObsBar {...obs} />}
      {children}
    </div>
  );
}

export function AlertsFeature({ alertsEnabled }: { alertsEnabled: boolean }) {
  const t = useTranslations("featureHub");
  // Saved tiers, shared between the tiers editor and the preview.
  const [tiers, setTiers] = useState<AlertTier[]>([]);
  return (
    <FeatureSettingsLayout title={t("f_alerts")} enabled={alertsEnabled} toggleKind="alertsToggle" obs={{ feature: "alerts" }}>
      <OverlaySettings
        view="alerts"
        aside={(config) => <AlertPreview config={config} tiers={tiers} />}
        tiersSlot={(config, reload) => <AlertTiersSection config={config} onSaved={setTiers} reload={reload} />}
      />
    </FeatureSettingsLayout>
  );
}

/** Goal settings: one goal or several items, bar styles and display (src/components/features/GoalPage.tsx). */
export function GoalFeature() {
  return <GoalPage />;
}

export function SubathonFeature() {
  const t = useTranslations("featureHub");
  return (
    <FeatureSettingsLayout title={t("f_subathon")} obs={{ feature: "subathon" }}>
      <OverlaySettings view="subathon" />
    </FeatureSettingsLayout>
  );
}
