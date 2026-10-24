"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ColorField } from "@/components/ColorField";
import { Switch } from "@/components/features/FeatureCard";
import { FeatureSettingsLayout } from "@/components/features/FeaturePages";
import { AutoSaveInput } from "@/components/features/LibraryBits";
import { SpinTodo } from "@/components/features/SpinTodo";
import { DEFAULT_COLOR, PRESET_COLORS } from "@/lib/colors";
import {
  MAX_LEVEL_BAHT,
  MAX_LEVELS,
  MAX_REWARD_TEXT,
  type Difficulty,
  type LevelRow,
} from "@/lib/combo";

type ComboSettings = {
  enabled: boolean;
  difficulty: Difficulty;
  rows: LevelRow[];
  color: string | null;
  alertColor: string | null;
  autoConfirm: boolean;
  typical: number;
  sizes: number[];
  live: boolean;
  current: { level: number; progress: number; size: number; endsAt: string } | null;
  cooldownUntil: string | null;
};

const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "custom"];
const STATUS_REFRESH_MS = 15_000;

async function fetchCombo(): Promise<ComboSettings | null> {
  const res = await fetch("/api/combo").catch(() => null);
  return res?.ok ? res.json() : null;
}

/**
 * "คอมโบทิป" settings: on/off, difficulty (or the creator's own baht per
 * level), the level table with rewards, and the colour; the OBS bar under the
 * title carries the link status and the test.
 * Everything saves by itself; edits apply to the next combo.
 */
export function ComboPage() {
  const t = useTranslations("combo");
  const tHub = useTranslations("featureHub");
  const locale = useLocale();
  const [data, setData] = useState<ComboSettings | null>(null);
  const [error, setError] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [test, setTest] = useState<"sent" | "failed" | null>(null);
  // Saves replace the table, so they run one at a time on the newest copy.
  const latest = useRef<ComboSettings | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  function apply(d: ComboSettings | null) {
    if (!d) return;
    latest.current = d;
    setData(d);
  }

  useEffect(() => {
    fetchCombo().then(apply);
    // Keep the connection / running-combo status fresh without touching edits.
    const id = setInterval(
      () =>
        fetchCombo().then((d) => {
          if (!d) return;
          setData((cur) => (cur ? { ...cur, live: d.live, current: d.current, cooldownUntil: d.cooldownUntil } : d));
        }),
      STATUS_REFRESH_MS,
    );
    return () => clearInterval(id);
  }, []);

  function save(build: (cur: ComboSettings) => Record<string, unknown>): Promise<boolean> {
    const run = queue.current.then(async () => {
      const cur = latest.current;
      if (!cur) return false;
      const res = await fetch("/api/combo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(build(cur)),
      }).catch(() => null);
      const d = res?.ok ? ((await res.json()) as ComboSettings) : null;
      setError(!d);
      apply(d);
      return Boolean(d);
    });
    queue.current = run.catch(() => {});
    return run;
  }

  async function toggle(next: boolean) {
    if (!data) return;
    setToggling(true);
    setData((cur) => (cur ? { ...cur, enabled: next } : cur));
    try {
      const fd = new FormData();
      fd.append("kind", "comboToggle");
      fd.append("enabled", next ? "1" : "0");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      if (latest.current) latest.current = { ...latest.current, enabled: next };
      // Only the running-combo status can change here (turning off stops it).
      fetchCombo().then((d) => d && setData((cur) => (cur ? { ...cur, current: d.current } : d)));
    } catch {
      setData((cur) => (cur ? { ...cur, enabled: !next } : cur));
      setError(true);
    } finally {
      setToggling(false);
    }
  }

  if (!data) return null;
  const custom = data.difficulty === "custom";
  // In custom mode every row must carry its baht; fill gaps from the shown sizes.
  const rowsWith = (change: (rows: LevelRow[]) => LevelRow[]) => (cur: ComboSettings) => ({
    rows: change(
      cur.difficulty === "custom" ? cur.rows.map((r, j) => ({ ...r, amount: r.amount ?? cur.sizes[j] ?? 100 })) : cur.rows,
    ),
  });

  async function testOnObs() {
    setTest(null);
    const res = await fetch("/api/combo/test", { method: "POST" }).catch(() => null);
    setTest(res?.ok ? "sent" : "failed");
  }

  return (
    <FeatureSettingsLayout
      title={tHub("f_combo")}
      headerExtra={
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-900/75">
          {tHub("enable")}
          <Switch checked={data.enabled} onChange={toggle} label={tHub("f_combo")} disabled={toggling} />
        </span>
      }
      obs={{ feature: "combo", onTest: testOnObs, testState: test }}
    >
      <p className="text-sm text-brand-900/65">{t("howItWorks")}</p>
      <p className="text-sm text-brand-900/65">{t("onlyWhenLinkOpen")}</p>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        {data.current && (
          <span className="text-xs font-semibold text-brand-700">
            {t("running", { level: data.current.level, progress: data.current.progress, size: data.current.size })}
          </span>
        )}
        {!data.current && data.cooldownUntil && (
          <span className="text-xs text-brand-900/60">
            {t("cooldown", { time: new Date(data.cooldownUntil).toLocaleTimeString(locale === "th" ? "th-TH" : "en-GB", { hour: "2-digit", minute: "2-digit" }) })}
          </span>
        )}
      </p>
      {!data.autoConfirm && (
        <p className="rounded-xl bg-tip-50 px-3 py-2 text-sm text-tip-700">
          {t("autoConfirmHint")}{" "}
          <Link href={`/${locale}/dashboard/settings`} className="font-semibold underline">
            {t("autoConfirmLink")}
          </Link>
        </p>
      )}
      {error && <p className="text-sm font-medium text-red-600">{t("saveFailed")}</p>}

      <section className="rounded-2xl border border-brand-200 p-4">
        <h2 className="font-bold text-brand-900">① {t("difficulty")}</h2>
        <div className="mt-2 inline-flex flex-wrap overflow-hidden rounded-full border border-brand-300" role="radiogroup" aria-label={t("difficulty")}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={data.difficulty === d}
              onClick={() => data.difficulty !== d && void save(() => ({ difficulty: d }))}
              className={`px-3.5 py-1.5 text-sm font-semibold ${data.difficulty === d ? "bg-brand-600 text-white" : "text-brand-800 hover:bg-brand-100"}`}
            >
              {t(`d_${d}`)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-brand-900/60">
          {custom ? t("customHint") : t("autoHint", { typical: data.typical.toLocaleString() })}
        </p>
      </section>

      <section className="rounded-2xl border border-brand-200 p-4">
        <h2 className="font-bold text-brand-900">
          ② {t("levels")} <span className="text-xs font-normal text-brand-900/55">{t("noMoney")}</span>
        </h2>
        <ul className="mt-3 space-y-2">
          {data.rows.map((row, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 p-2">
              <span className="w-16 shrink-0 text-xs font-semibold text-brand-700">{t("levelN", { level: i + 1 })}</span>
              {custom ? (
                <AutoSaveInput
                  value={String(row.amount ?? data.sizes[i])}
                  ariaLabel={t("bahtOf", { level: i + 1 })}
                  inputMode="numeric"
                  className="w-24!"
                  save={(v) => {
                    const n = Number(v);
                    if (!Number.isInteger(n) || n < 1 || n > MAX_LEVEL_BAHT) return Promise.resolve(false);
                    return save(rowsWith((rows) => rows.map((r, j) => (j === i ? { ...r, amount: n } : r))));
                  }}
                />
              ) : (
                <span className="w-24 shrink-0 text-sm text-brand-900/70">฿{(data.sizes[i] ?? 0).toLocaleString()}</span>
              )}
              {i === 0 ? (
                <span className="min-w-40 flex-1 text-sm text-brand-900/55">{t("level1NoReward")}</span>
              ) : (
                <AutoSaveInput
                  value={row.reward}
                  ariaLabel={t("rewardOf", { level: i + 1 })}
                  placeholder={t("rewardPlaceholder")}
                  maxLength={MAX_REWARD_TEXT}
                  className="min-w-40 flex-1"
                  save={(v) => save(rowsWith((rows) => rows.map((r, j) => (j === i ? { ...r, reward: v } : r))))}
                />
              )}
              {i > 0 && i === data.rows.length - 1 && (
                <button
                  type="button"
                  onClick={() => void save(rowsWith((rows) => rows.slice(0, -1)))}
                  aria-label={t("deleteLevel")}
                  className="rounded-lg p-1.5 text-brand-900/50 hover:bg-red-50 hover:text-red-600"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {data.rows.length < MAX_LEVELS ? (
          <button
            type="button"
            onClick={() =>
              void save(
                rowsWith((rows) => [
                  ...rows,
                  { amount: custom ? (data.sizes[data.sizes.length - 1] ?? 100) : null, reward: "" },
                ]),
              )
            }
            className="mt-2 rounded-full border border-dashed border-brand-400 px-3.5 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            {t("addLevel", { level: data.rows.length + 1 })}
          </button>
        ) : (
          <p className="mt-2 text-xs text-brand-900/55">{t("levelsMax", { max: MAX_LEVELS })}</p>
        )}
        <p className="mt-2 text-xs text-brand-900/55">{t("levelsHint")}</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-brand-200 p-4">
        <h2 className="font-bold text-brand-900">③ {t("obsAndColor")}</h2>
        <div className="rounded-xl bg-brand-50 p-3">
          <ColorField
            value={data.color}
            fallback={data.alertColor ?? DEFAULT_COLOR}
            presets={PRESET_COLORS}
            label={t("color")}
            codeLabel={t("colorCode")}
            resetLabel={t("colorReset")}
            defaultLabel={t("colorDefault")}
            onSave={(hex) => void save(() => ({ color: hex }))}
            onReset={() => void save(() => ({ color: null }))}
          />
        </div>
      </section>

      {/* Rewards reached land here (shared with the wheel's results). */}
      <SpinTodo />
    </FeatureSettingsLayout>
  );
}
