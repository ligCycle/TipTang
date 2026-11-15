"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ColorField } from "@/components/ColorField";
import { Switch } from "@/components/features/FeatureCard";
import { FeatureSettingsLayout } from "@/components/features/FeaturePages";
import { FeaturePreviewLayout, PREVIEW_WIDTH, PreviewStage } from "@/components/features/PreviewPanel";
import { TopView } from "@/components/overlay/TopOverlayClient";
import { DEFAULT_COLOR, PRESET_COLORS } from "@/lib/colors";
import { RANGES, type Range } from "@/lib/range";
import { TOP_COUNTS, topCountOf, topRangeOf, type TopCount, type TopFeed } from "@/lib/top-board";

/** `color` = the bar's own colour (null = the alert colour, `alertColor`). */
type TopSettings = { enabled: boolean; range: Range; count: TopCount; color: string | null; alertColor: string | null };

/** Stand-in rows for a creator with no public supporters yet in the range (labelled as a sample). */
const SAMPLE = ["มิ้นท์", "พี่โอ๊ต", "Skye", "น้ำหวาน", "Ken", "ฟ้าใส", "Boss", "ต้นกล้า", "Mali", "แพรว"].map((name, i) => ({
  name,
  total: [1250, 800, 450, 300, 220, 150, 120, 90, 60, 40][i],
}));

/**
 * "ท็อปผู้สนับสนุน" settings: on/off, the range counted and how many rows the
 * bar shows. Saves by itself. Ranking is the donate page's (public names only).
 */
export function TopPage() {
  const t = useTranslations("topPage");
  const tHub = useTranslations("featureHub");
  const [data, setData] = useState<TopSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  // The creator's real ranking for the chosen range and rows (null = not loaded yet).
  const [real, setReal] = useState<TopFeed["items"] | null>(null);

  useEffect(() => {
    fetch("/api/overlay/setup", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return setError(true);
        setData({ enabled: Boolean(d.topEnabled), range: topRangeOf(d.topRange), count: topCountOf(d.topCount), color: d.topColor ?? null, alertColor: d.color ?? null });
      })
      .catch(() => setError(true));
  }, []);

  const range = data?.range;
  const count = data?.count;
  useEffect(() => {
    if (!range || !count) return;
    let active = true;
    fetch(`/api/overlay/top-preview?range=${range}&count=${count}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TopFeed | null) => active && setReal(d?.items ?? []))
      .catch(() => active && setReal([]));
    return () => {
      active = false;
    };
  }, [range, count]);

  async function post(fields: Record<string, string>): Promise<boolean> {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    const res = await fetch("/api/overlay/asset", { method: "POST", body: fd }).catch(() => null);
    setError(!res?.ok);
    return Boolean(res?.ok);
  }

  async function toggle(next: boolean) {
    if (!data) return;
    setBusy(true);
    setData({ ...data, enabled: next });
    if (!(await post({ kind: "topToggle", enabled: next ? "1" : "0" }))) setData((d) => (d ? { ...d, enabled: !next } : d));
    setBusy(false);
  }

  async function config(range: Range, count: TopCount) {
    if (!data) return;
    const before = data;
    setData({ ...data, range, count });
    if (!(await post({ kind: "topConfig", range, count: String(count) }))) setData(before);
  }

  async function saveColor(hex: string | null) {
    if (!data) return;
    const before = data;
    setData({ ...data, color: hex });
    if (!(await post(hex ? { kind: "topColor", color: hex } : { kind: "topColor", remove: "1" }))) setData(before);
  }

  if (!data) return error ? <p className="text-sm font-medium text-red-600">{t("loadFailed")}</p> : null;

  const pill = (active: boolean) =>
    `px-3.5 py-1.5 text-sm font-semibold ${active ? "bg-brand-600 text-white" : "text-brand-800 hover:bg-brand-100"}`;

  return (
    <FeatureSettingsLayout
      title={tHub("f_top")}
      headerExtra={
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-900/75">
          {tHub("enable")}
          <Switch checked={data.enabled} onChange={toggle} label={tHub("f_top")} disabled={busy} />
        </span>
      }
      obs={{ feature: "top" }}
    >
      <FeaturePreviewLayout
        preview={
          <PreviewStage width={PREVIEW_WIDTH} note={real && real.length > 0 ? t("previewNoteReal") : t("previewNote")}>
            <TopView
              feed={{ range: data.range, items: real && real.length > 0 ? real : SAMPLE.slice(0, data.count) }}
              color={data.color ?? data.alertColor}
            />
          </PreviewStage>
        }
      >
        <p className="text-sm text-brand-900/65">{t("howItWorks")}</p>
        <p className="text-sm text-brand-900/65">{t("publicOnly")}</p>
        {error && <p className="text-sm font-medium text-red-600">{t("saveFailed")}</p>}

        <section className="rounded-2xl border border-brand-200 p-4">
          <h2 className="font-bold text-brand-900">{t("range")}</h2>
          <div className="mt-2 inline-flex flex-wrap overflow-hidden rounded-full border border-brand-300" role="radiogroup" aria-label={t("range")}>
            {RANGES.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={data.range === r} onClick={() => data.range !== r && void config(r, data.count)} className={pill(data.range === r)}>
                {t(`r_${r}`)}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-brand-200 p-4">
          <h2 className="font-bold text-brand-900">{t("count")}</h2>
          <div className="mt-2 inline-flex flex-wrap overflow-hidden rounded-full border border-brand-300" role="radiogroup" aria-label={t("count")}>
            {TOP_COUNTS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={data.count === c} onClick={() => data.count !== c && void config(data.range, c)} className={pill(data.count === c)}>
                {t("rows", { n: c })}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-brand-200 p-4">
          <h2 className="font-bold text-brand-900">{t("color")}</h2>
          <div className="mt-2 rounded-xl bg-brand-50 p-3">
            <ColorField
              value={data.color}
              fallback={data.alertColor ?? DEFAULT_COLOR}
              presets={PRESET_COLORS}
              label={t("color")}
              codeLabel={t("colorCode")}
              resetLabel={t("colorReset")}
              defaultLabel={t("colorDefault")}
              onSave={(hex) => void saveColor(hex)}
              onReset={() => void saveColor(null)}
            />
          </div>
        </section>
      </FeaturePreviewLayout>
    </FeatureSettingsLayout>
  );
}
