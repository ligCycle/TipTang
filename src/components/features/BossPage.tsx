"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ColorField } from "@/components/ColorField";
import { Switch } from "@/components/features/FeatureCard";
import { FeatureSettingsLayout } from "@/components/features/FeaturePages";
import { AutoSaveInput, fetchLibrary, type LibFile } from "@/components/features/LibraryBits";
import { loadHub, type HubState } from "@/components/features/FeatureHub";
import { SpinTodo } from "@/components/features/SpinTodo";
import { DEFAULT_COLOR, PRESET_COLORS } from "@/lib/colors";
import { MAX_BOSS_HP, MAX_BOSS_NAME, MAX_BOSS_REWARD, MAX_BOSSES, MIN_BOSS_HP } from "@/lib/boss";

type Boss = { id: string; name: string; hp: number; reward: string; imageUrl: string | null; position: number };
type Kill = { id: string; bossName: string; reward: string; killer: string; topFan: string; topAmount: number; killedAt: string };
type BossState = {
  enabled: boolean;
  color: string | null;
  alertColor: string | null;
  live: boolean;
  bosses: Boss[];
  current: { id: string; index: number; damage: number; defeated: number } | null;
  kills: Kill[];
};

const STATUS_REFRESH_MS = 15_000;

async function json(url: string, method = "GET", body?: unknown): Promise<{ ok: boolean; data: BossState | null; error?: string }> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { ok: false, data: null };
  const d = await res.json().catch(() => null);
  return res.ok ? { ok: true, data: d as BossState } : { ok: false, data: null, error: d?.error };
}

function wholeHp(v: string): number | null {
  const n = Number(v.replace(/,/g, ""));
  return Number.isInteger(n) && n >= MIN_BOSS_HP && n <= MAX_BOSS_HP ? n : null;
}

/**
 * "ตีบอส" settings: the boss list (name, HP, reward, picture, order), the
 * run's progress with a reset, the OBS link with colour and a test, and the
 * rewards in the shared to-do list. Everything saves by itself.
 */
export function BossPage() {
  const t = useTranslations("bossPage");
  const tHub = useTranslations("featureHub");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [data, setData] = useState<BossState | null>(null);
  const [hub, setHub] = useState<HubState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [test, setTest] = useState<"sent" | "failed" | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [images, setImages] = useState<LibFile[] | null>(null);
  const [draft, setDraft] = useState({ name: "", hp: "", reward: "" });
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    json("/api/boss").then((r) => r.data && setData(r.data));
    loadHub().then(setHub);
    // Keep the connection badge and the run's progress fresh without touching edits.
    const id = setInterval(
      () =>
        json("/api/boss").then((r) => {
          const d = r.data;
          if (!d) return;
          setData((cur) => (cur ? { ...cur, live: d.live, current: d.current, kills: d.kills } : d));
        }),
      STATUS_REFRESH_MS,
    );
    return () => clearInterval(id);
  }, []);

  /** Saves one at a time; the answer is the whole new state. */
  function run(url: string, method: string, body?: unknown): Promise<boolean> {
    const p = queue.current.then(async () => {
      const r = await json(url, method, body);
      if (r.data) setData(r.data);
      setError(r.ok ? null : r.error === "money_prize" ? t("moneyPrize") : r.error === "too_many" ? t("tooMany") : t("saveFailed"));
      return r.ok;
    });
    queue.current = p.catch(() => {});
    return p;
  }

  async function toggle(next: boolean) {
    if (!data) return;
    setToggling(true);
    setData((cur) => (cur ? { ...cur, enabled: next } : cur));
    try {
      const fd = new FormData();
      fd.append("kind", "bossToggle");
      fd.append("enabled", next ? "1" : "0");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
    } catch {
      setData((cur) => (cur ? { ...cur, enabled: !next } : cur));
      setError(t("saveFailed"));
    } finally {
      setToggling(false);
    }
  }

  async function openPicker(id: string) {
    setPicking(id);
    if (!images) {
      const lib = await fetchLibrary().catch(() => null);
      setImages(lib ? lib.files.filter((f) => f.kind === "image") : []);
    }
  }

  function move(i: number, dir: -1 | 1) {
    if (!data) return;
    const ids = data.bosses.map((b) => b.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void run("/api/boss/bosses", "PATCH", { order: ids });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const hp = wholeHp(draft.hp);
    if (!draft.name.trim() || !hp) return setError(t("addInvalid", { min: MIN_BOSS_HP, max: MAX_BOSS_HP.toLocaleString() }));
    const ok = await run("/api/boss/bosses", "POST", { name: draft.name, hp, reward: draft.reward });
    if (ok) setDraft({ name: "", hp: "", reward: "" });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  async function testOnObs() {
    setTest(null);
    const res = await fetch("/api/boss/test", { method: "POST" }).catch(() => null);
    setTest(res?.ok ? "sent" : "failed");
  }

  if (!data) return null;
  const obsUrl = hub ? `${hub.overlayBase}/boss?key=${hub.overlayKey}` : null;
  const todoUrl = hub ? `${hub.overlayBase}/todo?key=${hub.overlayKey}` : null;
  const current = data.current ? data.bosses.find((b) => b.id === data.current?.id) : undefined;
  const time = (iso: string) =>
    new Date(iso).toLocaleString(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const linkButton = (url: string) => (
    <button
      type="button"
      onClick={() => copy(url)}
      className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
    >
      <Icon name="link" className="h-3.5 w-3.5" />
      {copied === url ? tHub("copied") : tHub("copyObs")}
    </button>
  );

  return (
    <FeatureSettingsLayout
      title={tHub("f_boss")}
      headerExtra={
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-900/75">
          {tHub("enable")}
          <Switch checked={data.enabled} onChange={toggle} label={tHub("f_boss")} disabled={toggling} />
        </span>
      }
    >
      <p className="text-sm text-brand-900/65">{t("howItWorks")}</p>
      <p className="text-sm text-brand-900/65">{t("onlyWhenLinkOpen")}</p>
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${data.live ? "bg-emerald-100 text-emerald-700" : "bg-brand-900/10 text-brand-900/60"}`}>
          <span className={`h-2 w-2 rounded-full ${data.live ? "bg-emerald-500" : "bg-brand-900/30"}`} />
          {data.live ? t("linkLive") : t("linkOff")}
        </span>
      </p>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <section className="rounded-2xl border border-brand-200 p-4">
        <h2 className="font-bold text-brand-900">
          ① {t("bosses", { count: data.bosses.length, max: MAX_BOSSES })} <span className="text-xs font-normal text-brand-900/55">{t("noMoney")}</span>
        </h2>
        {data.bosses.length === 0 && <p className="mt-2 text-sm text-brand-900/60">{t("empty")}</p>}
        <ul className="mt-3 space-y-2">
          {data.bosses.map((b, i) => (
            <li key={b.id} className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 ${b.id === data.current?.id ? "border-brand-500 bg-brand-50/60" : "border-brand-200"}`}>
              <button type="button" onClick={() => openPicker(b.id)} aria-label={t("picture")} className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-100 text-brand-700">
                {b.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Icon name="image" className="h-4 w-4" />
                )}
              </button>
              <span className="w-6 shrink-0 text-center text-xs font-semibold text-brand-700">{i + 1}</span>
              <AutoSaveInput
                value={b.name}
                ariaLabel={t("name")}
                maxLength={MAX_BOSS_NAME}
                className="min-w-28 flex-1"
                save={(v) => run(`/api/boss/bosses/${b.id}`, "PATCH", { name: v })}
              />
              <span className="flex items-center gap-1 text-xs text-brand-900/60">
                HP
                <AutoSaveInput
                  value={String(b.hp)}
                  ariaLabel={t("hp")}
                  inputMode="numeric"
                  className="w-24!"
                  save={(v) => {
                    const hp = wholeHp(v);
                    if (!hp) return Promise.resolve(false);
                    return run(`/api/boss/bosses/${b.id}`, "PATCH", { hp });
                  }}
                />
              </span>
              <AutoSaveInput
                value={b.reward}
                ariaLabel={t("reward")}
                placeholder={t("rewardPlaceholder")}
                maxLength={MAX_BOSS_REWARD}
                className="min-w-36 flex-1"
                save={(v) => run(`/api/boss/bosses/${b.id}`, "PATCH", { reward: v })}
              />
              <span className="flex gap-1">
                {b.id === data.current?.id && (
                  <span className="self-center rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-bold text-white">{t("fighting")}</span>
                )}
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("moveUp")} className="rounded p-1 text-brand-700 disabled:opacity-30">↑</button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === data.bosses.length - 1} aria-label={t("moveDown")} className="rounded p-1 text-brand-700 disabled:opacity-30">↓</button>
                <button type="button" onClick={() => void run(`/api/boss/bosses/${b.id}`, "DELETE")} aria-label={t("delete")} className="rounded p-1 text-brand-900/50 hover:text-red-600">
                  <Icon name="trash" className="h-4 w-4" />
                </button>
              </span>
              {picking === b.id && (
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
                            await run(`/api/boss/bosses/${b.id}`, "PATCH", { imageUrl: img.url });
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
                    {b.imageUrl && (
                      <button
                        type="button"
                        onClick={async () => {
                          await run(`/api/boss/bosses/${b.id}`, "PATCH", { imageUrl: null });
                          setPicking(null);
                        }}
                        className="font-semibold text-brand-700"
                      >
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
        {data.bosses.length < MAX_BOSSES ? (
          <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              maxLength={MAX_BOSS_NAME}
              placeholder={t("namePlaceholder")}
              aria-label={t("name")}
              className="input min-w-28 flex-1"
            />
            <input
              value={draft.hp}
              onChange={(e) => setDraft({ ...draft, hp: e.target.value })}
              inputMode="numeric"
              placeholder={t("hpPlaceholder")}
              aria-label={t("hp")}
              className="input w-28!"
            />
            <input
              value={draft.reward}
              onChange={(e) => setDraft({ ...draft, reward: e.target.value })}
              maxLength={MAX_BOSS_REWARD}
              placeholder={t("rewardPlaceholder")}
              aria-label={t("reward")}
              className="input min-w-36 flex-1"
            />
            <button type="submit" className="btn-primary px-4 py-2 text-sm">
              {t("add")}
            </button>
          </form>
        ) : (
          <p className="mt-2 text-xs text-brand-900/55">{t("bossesMax", { max: MAX_BOSSES })}</p>
        )}
        <p className="mt-2 text-xs text-brand-900/55">{t("listHint")}</p>
      </section>

      <section className="space-y-2 rounded-2xl border border-brand-200 p-4">
        <h2 className="font-bold text-brand-900">② {t("progress")}</h2>
        {current && data.current ? (
          <p className="text-sm text-brand-900/80">
            {t("now", {
              name: current.name,
              index: data.current.index,
              total: data.bosses.length,
              left: Math.max(0, current.hp - data.current.damage).toLocaleString(),
              hp: current.hp.toLocaleString(),
              defeated: data.current.defeated,
            })}
          </p>
        ) : (
          <p className="text-sm text-brand-900/60">{t("noBoss")}</p>
        )}
        <button type="button" onClick={() => setResetOpen(true)} className="rounded-full border border-brand-300 px-3.5 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100">
          {t("reset")}
        </button>
        {data.kills.length > 0 && (
          <ul className="mt-1 space-y-1 text-sm">
            {data.kills.map((k) => (
              <li key={k.id} className="flex flex-wrap gap-x-2 border-t border-brand-100 pt-1 text-brand-900/75">
                <span className="font-semibold text-brand-900">{k.bossName}</span>
                <span>{t("killLine", { killer: k.killer, top: k.topFan, amount: k.topAmount.toLocaleString() })}</span>
                <span className="text-xs text-brand-900/50">{time(k.killedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-brand-200 p-4">
        <h2 className="font-bold text-brand-900">③ {t("obsAndColor")}</h2>
        {obsUrl && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {linkButton(obsUrl)}
            <span className="text-xs text-brand-900/50">{tHub("obsSizeOf", { size: "600×320" })}</span>
          </p>
        )}
        {todoUrl && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-brand-900">{t("todoLink")}</span>
            {linkButton(todoUrl)}
            <span className="text-xs text-brand-900/50">{tHub("obsSizeOf", { size: "400×420" })}</span>
          </p>
        )}
        <div className="rounded-xl bg-brand-50 p-3">
          <ColorField
            value={data.color}
            fallback={data.alertColor ?? DEFAULT_COLOR}
            presets={PRESET_COLORS}
            label={t("color")}
            codeLabel={t("colorCode")}
            resetLabel={t("colorReset")}
            defaultLabel={t("colorDefault")}
            onSave={(hex) => void run("/api/boss", "PATCH", { color: hex })}
            onReset={() => void run("/api/boss", "PATCH", { color: null })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={testOnObs} className="btn-primary px-4 py-2 text-sm">
            {t("testOnObs")}
          </button>
          {test && (
            <span className={`text-xs ${test === "sent" ? "text-emerald-700" : "text-red-600"}`}>
              {test === "sent" ? t("testSent") : t("saveFailed")}
            </span>
          )}
        </div>
      </section>

      {/* Rewards of defeated bosses land here (shared with the wheel, combo and gacha). */}
      <SpinTodo />

      {resetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={t("reset")}>
          <div className="card w-full max-w-sm rounded-2xl p-5 shadow-2xl">
            <h3 className="font-bold text-brand-900">{t("resetTitle")}</h3>
            <p className="mt-2 text-sm text-brand-900/70">{t("resetBody")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setResetOpen(false)} className="rounded-full px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100">
                {tc("cancel")}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await run("/api/boss", "PATCH", { reset: true });
                  setResetOpen(false);
                }}
                className="btn-primary px-4 py-2 text-sm"
              >
                {t("resetConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeatureSettingsLayout>
  );
}
