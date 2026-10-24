"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ColorField } from "@/components/ColorField";
import { Switch } from "@/components/features/FeatureCard";
import { FeatureSettingsLayout } from "@/components/features/FeaturePages";
import { FeaturePreviewLayout } from "@/components/features/PreviewPanel";
import { GachaPreview } from "@/components/features/FeaturePreviews";
import { AutoSaveInput, fetchLibrary, type LibFile } from "@/components/features/LibraryBits";
import { DEFAULT_COLOR, PRESET_COLORS } from "@/lib/colors";
import { DEFAULT_ODDS, MAX_PRIZE_TEXT, MAX_PRIZES, MAX_PRIZES_PER_RARITY, RARITIES, rebalance, type Odds, type Rarity } from "@/lib/gacha";

type Prize = { id: string; rarity: Rarity; text: string; imageUrl: string | null; noAction: boolean; position: number };
type GachaState = {
  enabled: boolean;
  price: number;
  odds: Odds;
  effective: Odds;
  version: number;
  color: string | null;
  alertColor: string | null;
  rulesAccepted: boolean;
  prizes: Prize[];
};

const RARITY_COLOR: Record<Rarity, string> = { common: "#94a3b8", rare: "#8b5cf6", epic: "#f59e0b" };
const RULES = ["rule1", "rule2", "rule3"] as const;

async function json(url: string, method = "GET", body?: unknown): Promise<{ ok: boolean; status: number; data: GachaState | null; error?: string }> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { ok: false, status: 0, data: null };
  const d = await res.json().catch(() => null);
  return res.ok ? { ok: true, status: res.status, data: d as GachaState } : { ok: false, status: res.status, data: null, error: d?.error };
}

function Modal({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="card max-h-[90vh] w-full max-w-lg overflow-x-hidden overflow-y-auto rounded-2xl p-5 shadow-2xl">{children}</div>
    </div>
  );
}

/**
 * "กาชา" settings: odds per rarity (always 100 in total), the prizes of each
 * rarity, the price, and the OBS link with colour and a test. Its own rules
 * checklist opens the first time it is switched on.
 */
export function GachaPage() {
  const t = useTranslations("gachaPage");
  const tHub = useTranslations("featureHub");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [data, setData] = useState<GachaState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // From the hub: switched on before the rules were accepted (?rules=1).
  const searchParams = useSearchParams();
  const [rulesOpen, setRulesOpen] = useState(() => searchParams.get("rules") === "1");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Odds | null>(null);
  const [newText, setNewText] = useState<Record<Rarity, string>>({ common: "", rare: "", epic: "" });
  const [picking, setPicking] = useState<string | null>(null);
  const [images, setImages] = useState<LibFile[] | null>(null);
  const [test, setTest] = useState<"sent" | "failed" | null>(null);
  const oddsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    json("/api/gacha").then((r) => r.data && setData(r.data));
    return () => {
      if (oddsTimer.current) clearTimeout(oddsTimer.current);
    };
  }, []);

  /** Saves one at a time; the answer is the whole new state. */
  function run(url: string, method: string, body?: unknown): Promise<boolean> {
    const p = queue.current.then(async () => {
      const r = await json(url, method, body);
      if (r.data) setData(r.data);
      if (!r.ok) {
        if (r.status === 409 && r.error === "rules") setRulesOpen(true);
        else setError(r.error === "money_prize" ? t("moneyPrize") : r.error === "too_many" ? t("tooMany") : t("saveFailed"));
      } else setError(null);
      return r.ok;
    });
    queue.current = p.catch(() => {});
    return p;
  }

  function slide(key: Rarity, value: number) {
    const base = draft ?? data?.odds ?? DEFAULT_ODDS;
    const next = rebalance(base, key, value);
    setDraft(next);
    if (oddsTimer.current) clearTimeout(oddsTimer.current);
    oddsTimer.current = setTimeout(async () => {
      await run("/api/gacha", "PATCH", { odds: next });
      // Saved or not, show what the server has now — unless the creator is
      // already dragging again (a newer draft).
      setDraft((cur) => (cur === next ? null : cur));
    }, 500);
  }

  async function acceptRules() {
    const res = await fetch("/api/gacha/rules", { method: "POST" }).catch(() => null);
    if (!res?.ok) return setError(t("saveFailed"));
    setRulesOpen(false);
    const r = await json("/api/gacha");
    if (r.data) setData(r.data);
  }

  async function openPicker(id: string) {
    setPicking(id);
    if (!images) {
      const lib = await fetchLibrary().catch(() => null);
      setImages(lib ? lib.files.filter((f) => f.kind === "image") : []);
    }
  }

  if (!data) return null;
  const odds = draft ?? data.odds;
  const byRarity = (r: Rarity) => data.prizes.filter((p) => p.rarity === r);
  const zeroWithPrizes = RARITIES.filter((r) => odds[r] === 0 && byRarity(r).length > 0);
  const total = data.prizes.length;

  async function testOnObs() {
    setTest(null);
    const res = await fetch("/api/gacha/test", { method: "POST" }).catch(() => null);
    setTest(res?.ok ? "sent" : "failed");
  }

  function move(r: Rarity, index: number, dir: -1 | 1) {
    const list = byRarity(r).map((p) => p.id);
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    const others = data!.prizes.filter((p) => p.rarity !== r).map((p) => p.id);
    void run("/api/gacha/prizes", "PATCH", { order: [...others, ...list] });
  }

  return (
    <FeatureSettingsLayout
      title={tHub("f_gacha")}
      headerExtra={
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-900/75">
          {tHub("enable")}
          <Switch
            checked={data.enabled}
            onChange={(next) => {
              if (next && !data.rulesAccepted) return setRulesOpen(true);
              void run("/api/gacha", "PATCH", { enabled: next });
            }}
            label={tHub("f_gacha")}
          />
        </span>
      }
      obs={{ feature: "gacha", onTest: testOnObs, testState: test }}
    >
      <FeaturePreviewLayout preview={<GachaPreview prizes={data.prizes} color={data.color ?? data.alertColor} />}>
      <p className="text-sm text-brand-900/65">{t("howItWorks")}</p>
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{t("noMoney")}</p>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <section className="space-y-3 rounded-2xl border border-brand-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-brand-900">① {t("odds")}</h2>
          <button
            type="button"
            onClick={() => {
              // A slider save still waiting must not land after the reset.
              if (oddsTimer.current) clearTimeout(oddsTimer.current);
              setDraft(null);
              void run("/api/gacha", "PATCH", { odds: DEFAULT_ODDS });
            }}
            className="text-xs font-semibold text-brand-700 hover:underline"
          >
            {t("resetOdds")}
          </button>
        </div>
        {RARITIES.map((r) => (
          <label key={r} className="block">
            <span className="flex items-center justify-between text-sm font-semibold text-brand-900">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: RARITY_COLOR[r] }} />
                {t(`r_${r}`)}
              </span>
              <span>
                {odds[r]}%
                <span className="ml-2 text-xs font-normal text-brand-900/55">{t("fansSee", { pct: data.effective[r] })}</span>
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={odds[r]}
              onChange={(e) => slide(r, Number(e.target.value))}
              className="w-full accent-brand-600"
              aria-label={t("oddsOf", { rarity: t(`r_${r}`) })}
            />
          </label>
        ))}
        {zeroWithPrizes.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{t("zeroWarn")}</p>}
        <p className="text-xs text-brand-900/55">{t("oddsHint")}</p>
      </section>

      <section className="space-y-4 rounded-2xl border border-brand-200 p-4">
        <h2 className="font-bold text-brand-900">
          ② {t("prizes", { count: total })} <span className="text-xs font-normal text-brand-900/55">{t("prizesMax", { max: MAX_PRIZES })}</span>
        </h2>
        {RARITIES.map((r) => {
          const list = byRarity(r);
          return (
            <div key={r} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: RARITY_COLOR[r] }}>
                <span className="h-3 w-3 rounded-full" style={{ background: RARITY_COLOR[r] }} />
                {t(`r_${r}`)} <span className="text-xs font-normal text-brand-900/55">({list.length}/{MAX_PRIZES_PER_RARITY})</span>
              </h3>
              <ul className="space-y-2">
                {list.map((p, i) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 p-2">
                    <button type="button" onClick={() => openPicker(p.id)} aria-label={t("picture")} className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-100 text-brand-700">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icon name="image" className="h-4 w-4" />
                      )}
                    </button>
                    <AutoSaveInput
                      value={p.text}
                      ariaLabel={t("prizeText")}
                      maxLength={MAX_PRIZE_TEXT}
                      className="min-w-32 flex-1"
                      save={(v) => run(`/api/gacha/prizes/${p.id}`, "PATCH", { text: v })}
                    />
                    <label className="flex items-center gap-1 text-xs text-brand-900/70">
                      <input type="checkbox" checked={p.noAction} onChange={(e) => void run(`/api/gacha/prizes/${p.id}`, "PATCH", { noAction: e.target.checked })} className="h-3.5 w-3.5 accent-brand-600" />
                      {t("noAction")}
                    </label>
                    <span className="flex gap-1">
                      <button type="button" onClick={() => move(r, i, -1)} disabled={i === 0} aria-label={t("moveUp")} className="rounded p-1 text-brand-700 disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => move(r, i, 1)} disabled={i === list.length - 1} aria-label={t("moveDown")} className="rounded p-1 text-brand-700 disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => void run(`/api/gacha/prizes/${p.id}`, "DELETE")} aria-label={t("deletePrize")} className="rounded p-1 text-brand-900/50 hover:text-red-600">
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </span>
                    {picking === p.id && (
                      <div className="w-full rounded-xl border border-brand-200 p-2">
                        {images === null ? (
                          <p className="text-xs text-brand-900/55">…</p>
                        ) : images.length === 0 ? (
                          <p className="text-xs text-brand-900/55">
                            {t("noImages")}{" "}
                            <Link href={`/${locale}/dashboard/library`} className="font-semibold underline">
                              {t("library")}
                            </Link>
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {images.map((img) => (
                              <button
                                key={img.id}
                                type="button"
                                onClick={async () => {
                                  await run(`/api/gacha/prizes/${p.id}`, "PATCH", { imageUrl: img.url });
                                  setPicking(null);
                                }}
                                className="h-12 w-12 overflow-hidden rounded-lg border border-brand-200"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={img.url} alt="" className="h-full w-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex gap-3 text-xs">
                          {p.imageUrl && (
                            <button type="button" onClick={async () => { await run(`/api/gacha/prizes/${p.id}`, "PATCH", { imageUrl: null }); setPicking(null); }} className="font-semibold text-brand-700">
                              {t("removePicture")}
                            </button>
                          )}
                          <button type="button" onClick={() => setPicking(null)} className="font-semibold text-brand-700">
                            {tc("cancel")}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {list.length < MAX_PRIZES_PER_RARITY && total < MAX_PRIZES && (
                <form
                  className="flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const text = newText[r].trim();
                    if (!text) return;
                    if (await run("/api/gacha/prizes", "POST", { rarity: r, text })) setNewText((cur) => ({ ...cur, [r]: "" }));
                  }}
                >
                  <input
                    value={newText[r]}
                    onChange={(e) => setNewText((cur) => ({ ...cur, [r]: e.target.value }))}
                    maxLength={MAX_PRIZE_TEXT}
                    placeholder={t("newPrize")}
                    aria-label={t("newPrizeOf", { rarity: t(`r_${r}`) })}
                    className="input min-w-0 flex-1"
                  />
                  <button type="submit" className="btn-secondary shrink-0 px-3 py-1.5 text-sm">
                    {t("add")}
                  </button>
                </form>
              )}
            </div>
          );
        })}
        <p className="text-xs text-brand-900/55">{t("prizesHint")}</p>
      </section>

      <section className="space-y-2 rounded-2xl border border-brand-200 p-4">
        <h2 className="font-bold text-brand-900">③ {t("price")}</h2>
        <AutoSaveInput
          value={String(data.price)}
          ariaLabel={t("price")}
          inputMode="numeric"
          className="w-28!"
          save={(v) => {
            const n = Number(v);
            if (!Number.isInteger(n) || n < 1 || n > 100_000) return Promise.resolve(false);
            return run("/api/gacha", "PATCH", { price: n });
          }}
        />
        <p className="text-xs text-brand-900/55">{t("priceHint")}</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-brand-200 p-4">
        <h2 className="font-bold text-brand-900">④ {t("obsAndColor")}</h2>
        <div className="rounded-xl bg-brand-50 p-3">
          <ColorField
            value={data.color}
            fallback={data.alertColor ?? DEFAULT_COLOR}
            presets={PRESET_COLORS}
            label={t("color")}
            codeLabel={t("colorCode")}
            resetLabel={t("colorReset")}
            defaultLabel={t("colorDefault")}
            onSave={(hex) => void run("/api/gacha", "PATCH", { color: hex })}
            onReset={() => void run("/api/gacha", "PATCH", { color: null })}
          />
        </div>
      </section>

      {rulesOpen && (
        <Modal label={t("rulesTitle")}>
          <h2 className="text-lg font-extrabold text-brand-900">{t("rulesTitle")}</h2>
          <p className="mt-1 text-sm text-brand-900/65">{t("rulesIntro")}</p>
          <ul className="mt-4 space-y-2">
            {RULES.map((r) => (
              <li key={r}>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-brand-200 p-3 text-sm text-brand-900">
                  <input type="checkbox" checked={Boolean(ticked[r])} onChange={(e) => setTicked((cur) => ({ ...cur, [r]: e.target.checked }))} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
                  {t(r)}
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-brand-900/55">
            <Link href={`/${locale}/terms#random-features`} target="_blank" className="font-semibold text-brand-700 hover:underline">
              {t("rulesTermsLink")}
            </Link>
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setRulesOpen(false)} className="btn-secondary px-4 py-2 text-sm">
              {tc("cancel")}
            </button>
            <button type="button" onClick={acceptRules} disabled={!RULES.every((r) => ticked[r])} className="btn-primary px-4 py-2 text-sm">
              {t("rulesAccept")}
            </button>
          </div>
        </Modal>
      )}
      </FeaturePreviewLayout>
    </FeatureSettingsLayout>
  );
}
