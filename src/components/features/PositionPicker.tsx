"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ANCHORS,
  isAnchor,
  sharedAnchors,
  DEFAULT_POSITIONS,
  type Anchor,
  type OnScreenFeature,
} from "@/lib/overlay-layout";

/**
 * 3x3 picker for where a feature sits on the single OBS link. Saves on
 * click; warns when another enabled feature already uses the same spot.
 */
export function PositionPicker({
  feature,
  positions,
  enabled,
}: {
  feature: OnScreenFeature;
  positions: Record<OnScreenFeature, string>;
  enabled: Record<OnScreenFeature, boolean>;
}) {
  const t = useTranslations("featureHub");
  const clean = (f: OnScreenFeature): Anchor =>
    isAnchor(positions[f]) ? (positions[f] as Anchor) : DEFAULT_POSITIONS[f];
  const [value, setValue] = useState<Anchor>(clean(feature));
  const [saving, setSaving] = useState(false);

  const current = { alert: clean("alert"), goal: clean("goal"), timer: clean("timer"), [feature]: value };
  const clash = sharedAnchors(current, enabled).find((g) => g.includes(feature));

  async function pick(a: Anchor) {
    const prev = value;
    setValue(a);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("kind", "position");
      fd.append("feature", feature);
      fd.append("anchor", a);
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
    } catch {
      setValue(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold text-brand-900/80">{t("position")}</p>
      <div
        role="radiogroup"
        aria-label={t("position")}
        className="mt-2 grid w-48 grid-cols-3 gap-1.5 rounded-xl border border-brand-200 bg-black/80 p-2"
      >
        {ANCHORS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={value === a}
            aria-label={t(`pos_${a}`)}
            title={t(`pos_${a}`)}
            disabled={saving}
            onClick={() => pick(a)}
            className={`h-8 rounded-md transition ${
              value === a ? "bg-brand-500" : "bg-white/15 hover:bg-white/30"
            }`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-brand-900/55">
        {t(`pos_${value}`)} · {t("positionHint")}
      </p>
      {clash && (
        <p className="mt-1 text-xs font-medium text-tip-700">
          {t("positionShared", {
            others: clash
              .filter((f) => f !== feature)
              .map((f) => t(`n_${f}`))
              .join(", "),
          })}
        </p>
      )}
    </div>
  );
}
