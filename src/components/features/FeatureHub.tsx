"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FEATURES, type FeatureDef } from "@/lib/feature-registry";
import type { FeatureFlags } from "@/lib/feature-presets";
import { FeatureCard } from "@/components/features/FeatureCard";
import { ObsLinkCard } from "@/components/features/ObsLinkCard";
import { SetSwitcher } from "@/components/features/SetSwitcher";
import { FirstVisitPopup } from "@/components/features/FirstVisitPopup";
import { WheelRulesDialog, WheelTemplatePicker } from "@/components/features/WheelRulesDialog";

export type HubState = {
  /** `${origin}/overlay/<username>` — each feature adds its obsPath + ?key. */
  overlayBase: string;
  overlayKey: string;
  lastSeenAt: string | null;
  flags: FeatureFlags;
  featuresOnboardedAt: string | null;
  /** The wheel's first-enable checklist was ticked. */
  wheelRulesAccepted: boolean;
};

/** Loads what the hub needs from /api/overlay/setup (which also makes the key). */
export async function loadHub(): Promise<HubState | null> {
  const res = await fetch("/api/overlay/setup", { method: "POST" });
  const d = await res.json().catch(() => null);
  if (!res.ok || !d?.key) return null;
  return {
    overlayBase: `${window.location.origin}/overlay/${d.username}`,
    overlayKey: d.key,
    lastSeenAt: d.overlayLastSeenAt ?? null,
    flags: {
      alertsEnabled: d.alertsEnabled !== false,
      goalOverlayEnabled: Boolean(d.goalEnabled),
      timerEnabled: Boolean(d.timerEnabled),
      soundPickEnabled: Boolean(d.soundPickEnabled),
      wheelEnabled: Boolean(d.wheelEnabled),
      comboEnabled: Boolean(d.comboEnabled),
      mediaEnabled: Boolean(d.mediaEnabled),
    },
    featuresOnboardedAt: d.featuresOnboardedAt ?? null,
    wheelRulesAccepted: Boolean(d.wheelRulesAccepted),
  };
}

/** A feature's own OBS browser-source link. */
export function obsUrl(hub: HubState, f: FeatureDef): string {
  return `${hub.overlayBase}${f.obsPath}?key=${hub.overlayKey}`;
}

const MAX_SUGGESTED = 3;

/**
 * The "ลูกเล่น" hub: OBS connection status on top, then the features that
 * are on (each with its own OBS link), up to three worth trying, and the full
 * list folded away.
 */
export function FeatureHub() {
  const t = useTranslations("featureHub");
  const tDash = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const [hub, setHub] = useState<HubState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Wheel: turning it on the first time goes through the rules, then a template.
  const [wheelStep, setWheelStep] = useState<"rules" | "template" | null>(null);

  useEffect(() => {
    loadHub()
      .then(setHub)
      .finally(() => setLoading(false));
  }, []);

  if (!hub) {
    return (
      <p className="text-sm text-brand-900/60" aria-live="polite">
        {loading ? tDash("processing") : tDash("obsLoadFailed")}
      </p>
    );
  }

  async function toggle(f: FeatureDef, next: boolean) {
    if (!hub) return;
    if (f.id === "wheel" && next && !hub.wheelRulesAccepted) {
      setWheelStep("rules");
      return;
    }
    const prev = hub;
    setError(null);
    setBusy(f.id);
    // Optimistic: flip now, roll back if the server says no.
    setHub({ ...hub, flags: { ...hub.flags, [f.flag]: next } });
    try {
      const fd = new FormData();
      fd.append("kind", f.toggleKind);
      fd.append("enabled", next ? "1" : "0");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      if (res.status === 409 && f.id === "wheel") {
        setHub(prev);
        setWheelStep("rules");
        return;
      }
      if (!res.ok) throw new Error();
    } catch {
      setHub(prev);
      setError(t("toggleFailed"));
    } finally {
      setBusy(null);
    }
  }

  const on = FEATURES.filter((f) => hub.flags[f.flag]);
  const off = FEATURES.filter((f) => !hub.flags[f.flag]);
  const card = (f: FeatureDef) => (
    <FeatureCard
      key={f.id}
      feature={f}
      enabled={hub.flags[f.flag]}
      obsUrl={f.obsPath === null ? null : obsUrl(hub, f)}
      busy={busy === f.id}
      onToggle={(next) => toggle(f, next)}
    />
  );

  return (
    <div className="space-y-6">
      {/* One-time chooser on the first visit (shows the OBS step first if never connected). */}
      {!hub.featuresOnboardedAt && <FirstVisitPopup hub={hub} onDone={setHub} />}
      <ObsLinkCard lastSeenAt={hub.lastSeenAt} />
      <SetSwitcher showManage />
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <section>
        <h2 className="mb-3 flex items-center justify-between text-sm font-bold text-brand-900">
          {t("activeTitle")}
          <span className="text-xs font-normal text-brand-900/55">
            {t("countActive", { count: on.length })}
          </span>
        </h2>
        {on.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-brand-200 p-4 text-sm text-brand-900/60">
            {t("noneActive")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{on.map(card)}</div>
        )}
      </section>

      {off.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold text-brand-900">{t("suggestTitle")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {off.slice(0, MAX_SUGGESTED).map(card)}
          </div>
        </section>
      )}

      {wheelStep === "rules" && (
        <WheelRulesDialog
          onCancel={() => setWheelStep(null)}
          onAccepted={async () => {
            setHub((h) => (h ? { ...h, wheelRulesAccepted: true, flags: { ...h.flags, wheelEnabled: true } } : h));
            const d = await fetch("/api/wheels").then((r) => r.json()).catch(() => null);
            setWheelStep(d && d.wheels?.length === 0 ? "template" : null);
          }}
        />
      )}
      {wheelStep === "template" && (
        <WheelTemplatePicker
          onCancel={() => setWheelStep(null)}
          onCreated={() => router.push(`/${locale}/dashboard/features/wheel`)}
        />
      )}

      <section className="rounded-2xl border border-dashed border-brand-200 p-4">
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-bold text-brand-900"
          aria-expanded={showAll}
        >
          {t("allTitle")} ({FEATURES.length})
          <span className="text-brand-700">{showAll ? t("hide") : t("show")}</span>
        </button>
        {showAll && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{FEATURES.map(card)}</div>
        )}
      </section>
    </div>
  );
}
