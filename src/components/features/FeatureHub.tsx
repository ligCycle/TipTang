"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FEATURES, type FeatureDef } from "@/lib/feature-registry";
import type { FeatureFlags } from "@/lib/feature-presets";
import { FeatureCard } from "@/components/features/FeatureCard";
import { ObsLinkCard } from "@/components/features/ObsLinkCard";
import { FirstVisitPopup } from "@/components/features/FirstVisitPopup";

export type HubState = {
  liveUrl: string;
  lastSeenAt: string | null;
  flags: FeatureFlags;
  featuresOnboardedAt: string | null;
};

/** Loads what the hub needs from /api/overlay/setup (which also makes the key). */
export async function loadHub(): Promise<HubState | null> {
  const res = await fetch("/api/overlay/setup", { method: "POST" });
  const d = await res.json().catch(() => null);
  if (!res.ok || !d?.key) return null;
  return {
    liveUrl: `${window.location.origin}/overlay/${d.username}/live?key=${d.key}`,
    lastSeenAt: d.overlayLastSeenAt ?? null,
    flags: {
      alertsEnabled: d.alertsEnabled !== false,
      goalOverlayEnabled: Boolean(d.goalEnabled),
      timerEnabled: Boolean(d.timerEnabled),
    },
    featuresOnboardedAt: d.featuresOnboardedAt ?? null,
  };
}

const MAX_SUGGESTED = 3;

/**
 * The "ลูกเล่น" hub: the single OBS link on top, then the features that are
 * on, up to three worth trying, and the full list folded away.
 */
export function FeatureHub() {
  const t = useTranslations("featureHub");
  const tDash = useTranslations("dashboard");
  const [hub, setHub] = useState<HubState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

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
      busy={busy === f.id}
      onToggle={(next) => toggle(f, next)}
    />
  );

  return (
    <div className="space-y-6">
      {/* One-time chooser on the first visit (shows the OBS step first if never connected). */}
      {!hub.featuresOnboardedAt && <FirstVisitPopup hub={hub} onDone={setHub} />}
      <ObsLinkCard liveUrl={hub.liveUrl} lastSeenAt={hub.lastSeenAt} />
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
