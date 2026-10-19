"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/Icon";
import { OverlayConnectionStatus } from "@/components/OverlayConnectionStatus";
import { PRESETS, presetChanges, type PresetId } from "@/lib/feature-presets";
import type { HubState } from "@/components/features/FeatureHub";

const PRESET_ICONS: Record<PresetId, IconName> = { basic: "bell", goal: "target", subathon: "clock" };

/**
 * One-time chooser on the first visit to the hub. If OBS was never
 * connected, it first shows the single link (the step most sign-ups drop at).
 * A preset only switches features on.
 */
export function FirstVisitPopup({ hub, onDone }: { hub: HubState; onDone: (h: HubState) => void }) {
  const t = useTranslations("featureHub");
  const [step, setStep] = useState<"obs" | "preset">(hub.lastSeenAt ? "preset" : "obs");
  const [choice, setChoice] = useState<PresetId>("basic");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  async function send(kind: "preset" | "onboardSkip") {
    setSaving(true);
    setError(false);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      if (kind === "preset") fd.append("preset", choice);
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const flags = kind === "preset" ? { ...hub.flags, ...presetChanges(hub.flags, choice) } : hub.flags;
      onDone({ ...hub, flags, featuresOnboardedAt: new Date().toISOString() });
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(hub.liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-lg rounded-2xl p-5 shadow-2xl">
        {step === "obs" ? (
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-brand-900">
              <Icon name="monitor" className="h-5 w-5" />
              {t("fvObsTitle")}
            </h2>
            <p className="text-sm text-brand-900/70">{t("fvObsSteps")}</p>
            <div className="flex flex-wrap gap-2">
              <input readOnly value={hub.liveUrl} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 font-mono text-xs" aria-label={t("obsTitle")} />
              <button type="button" onClick={copy} className="btn-primary px-4 py-2 text-sm">
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
            <OverlayConnectionStatus initialLastSeenAt={hub.lastSeenAt} />
            <div className="flex justify-end">
              <button type="button" onClick={() => setStep("preset")} className="btn-primary px-5 py-2 text-sm">
                {t("fvNext")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-extrabold text-brand-900">{t("fvTitle")}</h2>
            <p className="text-sm text-brand-900/65">{t("fvDesc")}</p>
            <div role="radiogroup" aria-label={t("fvTitle")} className="grid gap-2 sm:grid-cols-3">
              {(Object.keys(PRESETS) as PresetId[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={choice === p}
                  onClick={() => setChoice(p)}
                  className={`rounded-xl border p-3 text-left ${
                    choice === p ? "border-2 border-brand-500 bg-brand-50" : "border-brand-200"
                  }`}
                >
                  <Icon name={PRESET_ICONS[p]} className="h-5 w-5 text-brand-700" />
                  <p className="mt-1 font-bold text-brand-900">{t(`fv_${p}`)}</p>
                  <p className="text-xs text-brand-900/60">{t(`fvd_${p}`)}</p>
                </button>
              ))}
            </div>
            {error && <p className="text-sm font-medium text-red-600">{t("fvFailed")}</p>}
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => send("onboardSkip")} disabled={saving} className="text-sm font-semibold text-brand-900/60 hover:underline">
                {t("fvSkip")}
              </button>
              <button type="button" onClick={() => send("preset")} disabled={saving} className="btn-primary px-5 py-2 text-sm">
                {t("fvUse")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
