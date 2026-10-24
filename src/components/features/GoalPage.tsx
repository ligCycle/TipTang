"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ColorField } from "@/components/ColorField";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/features/FeatureCard";
import { FeatureSettingsLayout } from "@/components/features/FeaturePages";
import { FeaturePreviewLayout } from "@/components/features/PreviewPanel";
import { AutoSaveInput, fetchLibrary, uploadFile, useUploadError, type LibFile } from "@/components/features/LibraryBits";
import { GoalCard, GoalView } from "@/components/overlay/GoalView";
import { DEFAULT_COLOR, PRESET_COLORS } from "@/lib/colors";
import {
  GOAL_DISPLAYS,
  GOAL_STYLES,
  MAX_ITEM_NAME,
  MAX_ITEMS,
  cleanItemPrice,
  moveOnDelete,
  pctOf,
  type GoalDisplay,
  type GoalFeed,
  type GoalStyle,
  type GoalType,
} from "@/lib/wishlist";

type Item = { id: string; name: string; price: number; raised: number; imageUrl: string | null; full: boolean };
type Settings = {
  enabled: boolean;
  type: GoalType;
  style: GoalStyle;
  display: GoalDisplay;
  color: string | null;
  alertColor: string | null;
  single: { title: string; amount: number; raised: number; startedAt: string | null };
  items: Item[];
};

async function json(url: string, method = "GET", body?: unknown): Promise<Settings | null> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  return res?.ok ? res.json() : null;
}

async function assetForm(fields: Record<string, string>): Promise<boolean> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch("/api/overlay/asset", { method: "POST", body: fd }).catch(() => null);
  return Boolean(res?.ok);
}

/** The settings as the overlay would render them (for the previews). */
function asFeed(s: Settings, style: GoalStyle = s.style): GoalFeed {
  return {
    enabled: true,
    type: s.type,
    style,
    display: s.display,
    single: { title: s.single.title, goal: s.single.amount, raised: s.single.raised, pct: pctOf(s.single.raised, s.single.amount) },
    items: s.items.map((i) => ({ ...i, fans: 0 })),
  };
}

/**
 * Goal settings ("เป้าโดเนท"): type (one goal / several items), bar style with
 * live preview, the goal or the item list, on-stream display, colour and OBS
 * link. Everything saves by itself; item edits run one at a time.
 */
export function GoalPage() {
  const t = useTranslations("goalPage");
  const tHub = useTranslations("featureHub");
  const uploadError = useUploadError();
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<LibFile[] | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Single goal: both fields save together, so keep the newest of each here.
  const draft = useRef<{ title: string; amount: string } | null>(null);

  useEffect(() => {
    json("/api/goal").then((d) => d && setS(d));
  }, []);

  /** Run edits one at a time and take the server's answer as the new state. */
  function run(fn: () => Promise<Settings | null>): Promise<boolean> {
    const next = queue.current.then(async () => {
      const d = await fn();
      if (d) setS(d);
      setError(d ? null : t("saveFailed"));
      return Boolean(d);
    });
    queue.current = next.catch(() => {});
    return next;
  }

  if (!s) return null;
  const items = s.items;

  async function toggle(next: boolean) {
    setToggling(true);
    const ok = await assetForm({ kind: "goalToggle", enabled: next ? "1" : "0" });
    if (ok) setS((cur) => (cur ? { ...cur, enabled: next } : cur));
    else setError(tHub("toggleFailed"));
    setToggling(false);
  }

  function saveSingle(change: { title?: string; amount?: string }): Promise<boolean> {
    if (!s) return Promise.resolve(false);
    draft.current = {
      title: change.title ?? draft.current?.title ?? s.single.title,
      amount: change.amount ?? draft.current?.amount ?? (s.single.amount ? String(s.single.amount) : ""),
    };
    return run(async () => {
      const d = draft.current!;
      return (await assetForm({ kind: "goalSet", title: d.title, amount: d.amount })) ? json("/api/goal") : null;
    });
  }

  async function openPicker(itemId: string) {
    setPicking(itemId);
    if (!images) {
      const lib = await fetchLibrary().catch(() => null);
      setImages(lib ? lib.files.filter((f) => f.kind === "image") : []);
    }
  }

  async function uploadImage(itemId: string, file: File) {
    setBusy(true);
    try {
      const up = await uploadFile(file, false);
      if (!up.ok) {
        setError(uploadError(up.error));
        return;
      }
      const lib = await fetchLibrary();
      const imgs = lib.files.filter((f) => f.kind === "image");
      setImages(imgs);
      const url = imgs.find((f) => f.id === up.id)?.url;
      if (url) await run(() => json(`/api/goal/items/${itemId}`, "PATCH", { imageUrl: url }));
      setPicking(null);
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, dir: -1 | 1) {
    const order = items.map((i) => i.id);
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    void run(() => json("/api/goal/items", "PATCH", { order }));
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    await run(() => json(`/api/goal/items/${deleting.id}`, "DELETE"));
    setBusy(false);
    setDeleting(null);
  }

  /** "ลบแล้วยอด ฿X ย้ายไปเข้า A, B" or "ครบแล้ว — ยอดไม่ย้าย". */
  function deleteMessage(item: Item): string {
    if (item.full) return t("deleteFull", { name: item.name });
    const moves = moveOnDelete(items, item.id);
    if (moves.length === 0) return t("deleteEmpty", { name: item.name });
    const names = moves.map((m) => `${items.find((i) => i.id === m.itemId)?.name ?? ""} ฿${m.amount.toLocaleString()}`).join(", ");
    return t("deleteMoves", { name: item.name, amount: item.raised.toLocaleString(), targets: names });
  }

  const seg = (on: boolean) =>
    `px-3.5 py-1.5 text-sm font-semibold ${on ? "bg-brand-600 text-white" : "text-brand-800 hover:bg-brand-100"}`;
  const sample: GoalFeed = {
    enabled: true,
    type: "single",
    style: "classic",
    display: "all",
    single: { title: t("sampleTitle"), goal: 1000, raised: 600, pct: 60 },
    items: [],
  };

  return (
    <FeatureSettingsLayout
      title={tHub("f_goal")}
      headerExtra={
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-900/75">
          {tHub("enable")}
          <Switch checked={s.enabled} onChange={toggle} label={tHub("f_goal")} disabled={toggling} />
        </span>
      }
      obs={{ feature: "goal" }}
    >
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <FeaturePreviewLayout
        preview={
          <div className="space-y-2">
            <p className="text-sm font-bold text-brand-900">{t("preview")}</p>
            <div className="flex min-h-40 items-center justify-center rounded-2xl bg-[#0b1220] p-4">
              <GoalView goal={asFeed(s)} color={s.color ?? s.alertColor} />
            </div>
            <p className="text-xs text-brand-900/55">{t("previewHint")}</p>
          </div>
        }
      >
          <section className="rounded-2xl border border-brand-200 p-4">
            <h2 className="font-bold text-brand-900">① {t("type")}</h2>
            <div className="mt-2 inline-flex overflow-hidden rounded-full border border-brand-300" role="radiogroup" aria-label={t("type")}>
              {(["single", "multi"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={s.type === v} className={seg(s.type === v)}
                  onClick={() => s.type !== v && void run(() => json("/api/goal", "PATCH", { type: v }))}>
                  {t(`type_${v}`)}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-brand-900/60">{t(`typeHint_${s.type}`)}</p>
          </section>

          <section className="rounded-2xl border border-brand-200 p-4">
            <h2 className="font-bold text-brand-900">② {t("style")}</h2>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {GOAL_STYLES.map((st) => (
                <button key={st} type="button" aria-pressed={s.style === st}
                  onClick={() => s.style !== st && void run(() => json("/api/goal", "PATCH", { style: st }))}
                  className={`overflow-hidden rounded-xl border-2 text-left ${s.style === st ? "border-brand-600 ring-2 ring-brand-400/40" : "border-brand-200 hover:border-brand-400"}`}>
                  {/* A full-size card (480 px) scaled down, so every style looks as it will on stream. */}
                  <span className="pointer-events-none relative block h-24 overflow-hidden bg-[#0b1220]">
                    <span className="absolute left-1/2 top-1/2 block w-[480px] -translate-x-1/2 -translate-y-1/2 scale-[0.3]">
                      <GoalCard bar={{ ...sample.single, imageUrl: null }} style={st} color={s.color ?? s.alertColor} />
                    </span>
                  </span>
                  <span className={`block px-2 py-1.5 text-center text-sm font-semibold ${s.style === st ? "bg-brand-600 text-white" : "text-brand-900"}`}>
                    {t(`style_${st}`)}
                  </span>
                </button>
              ))}
            </div>
            {s.type === "multi" && (
              <div className="mt-3">
                <p className="text-sm font-semibold text-brand-900">{t("display")}</p>
                <div className="mt-1.5 inline-flex flex-wrap overflow-hidden rounded-full border border-brand-300" role="radiogroup" aria-label={t("display")}>
                  {GOAL_DISPLAYS.map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={s.display === d} className={seg(s.display === d)}
                      onClick={() => s.display !== d && void run(() => json("/api/goal", "PATCH", { display: d }))}>
                      {t(`display_${d}`)}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-brand-900/60">{t(`displayHint_${s.display}`)}</p>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-brand-200 p-4">
            <h2 className="font-bold text-brand-900">③ {s.type === "single" ? t("goal") : t("items", { count: items.length })}</h2>
            {s.type === "single" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold text-brand-900/75">{t("goalName")}</span>
                  <AutoSaveInput value={s.single.title} ariaLabel={t("goalName")} maxLength={80} placeholder={t("goalNamePlaceholder")}
                    save={(v) => saveSingle({ title: v })} />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-semibold text-brand-900/75">{t("goalAmount")}</span>
                  <AutoSaveInput value={s.single.amount ? String(s.single.amount) : ""} ariaLabel={t("goalAmount")} inputMode="numeric"
                    save={(v) => (Number(v) > 0 ? saveSingle({ amount: v }) : Promise.resolve(false))} />
                </label>
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {items.map((item, idx) => (
                    <li key={item.id} className="rounded-xl border border-brand-200 p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => openPicker(item.id)} aria-label={t("picture")}
                          className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-100 text-brand-700">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Icon name="image" className="h-5 w-5" />
                          )}
                        </button>
                        <AutoSaveInput value={item.name} ariaLabel={t("itemName")} maxLength={MAX_ITEM_NAME} className="min-w-36 flex-1"
                          save={(v) => run(() => json(`/api/goal/items/${item.id}`, "PATCH", { name: v }))} />
                        <AutoSaveInput value={String(item.price)} ariaLabel={t("itemPrice")} inputMode="numeric" className="w-28!"
                          save={(v) => (cleanItemPrice(v) === null ? Promise.resolve(false) : run(() => json(`/api/goal/items/${item.id}`, "PATCH", { price: cleanItemPrice(v) })))} />
                        <span className="flex items-center">
                          <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={t("moveUp")}
                            className="rounded-lg p-1.5 text-brand-700 hover:bg-brand-100 disabled:opacity-30">
                            <Icon name="chevron-down" className="h-4 w-4 rotate-180" />
                          </button>
                          <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} aria-label={t("moveDown")}
                            className="rounded-lg p-1.5 text-brand-700 hover:bg-brand-100 disabled:opacity-30">
                            <Icon name="chevron-down" className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setDeleting(item)} disabled={items.length <= 1} aria-label={t("deleteItem")}
                            className="rounded-lg p-1.5 text-brand-900/50 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </span>
                      </div>
                      <p className={`mt-1 text-xs ${item.full ? "font-semibold text-emerald-600" : "text-brand-900/60"}`}>
                        {idx === items.findIndex((i) => !i.full) && <span className="mr-1 rounded-full bg-brand-100 px-1.5 py-0.5 font-semibold text-brand-700">{t("mainItem")}</span>}
                        {item.full ? t("itemFull") : t("itemRaised", { raised: item.raised.toLocaleString(), price: item.price.toLocaleString() })}
                      </p>
                      {picking === item.id && (
                        <div className="mt-2 rounded-xl bg-brand-50 p-2.5">
                          <div className="flex flex-wrap gap-2">
                            {(images ?? []).map((f) => (
                              <button key={f.id} type="button"
                                onClick={() => { void run(() => json(`/api/goal/items/${item.id}`, "PATCH", { imageUrl: f.url })); setPicking(null); }}
                                className="h-12 w-12 overflow-hidden rounded-lg ring-1 ring-brand-200 hover:ring-brand-500">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={f.url} alt="" className="h-full w-full object-cover" />
                              </button>
                            ))}
                            <label className="grid h-12 w-12 cursor-pointer place-items-center rounded-lg border border-dashed border-brand-400 text-brand-700" aria-label={t("uploadPicture")}>
                              <Icon name="upload" className="h-4 w-4" />
                              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" disabled={busy}
                                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadImage(item.id, f); }} />
                            </label>
                          </div>
                          <div className="mt-2 flex gap-3 text-xs">
                            {item.imageUrl && (
                              <button type="button" className="font-semibold text-red-600 hover:underline"
                                onClick={() => { void run(() => json(`/api/goal/items/${item.id}`, "PATCH", { imageUrl: null })); setPicking(null); }}>
                                {t("removePicture")}
                              </button>
                            )}
                            <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setPicking(null)}>
                              {t("close")}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
                {items.length < MAX_ITEMS ? (
                  <button type="button"
                    onClick={() => void run(() => json("/api/goal/items", "POST", { name: t("newItemName", { n: items.length + 1 }), price: 1000 }))}
                    className="rounded-full border border-dashed border-brand-400 px-3.5 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                    {t("addItem")}
                  </button>
                ) : (
                  <p className="text-xs text-brand-900/55">{t("itemsMax", { max: MAX_ITEMS })}</p>
                )}
                <p className="text-xs text-brand-900/55">{t("itemsHint")}</p>
              </>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-brand-900/10 pt-3">
              <button type="button" onClick={() => setResetOpen(true)} className="btn-secondary px-4 py-1.5 text-sm">
                {t("newRound")}
              </button>
              {s.single.startedAt && (
                <span className="text-xs text-brand-900/55">{t("since", { date: new Date(s.single.startedAt).toLocaleDateString() })}</span>
              )}
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-brand-200 p-4">
            <h2 className="font-bold text-brand-900">④ {t("obsAndColor")}</h2>
            <div className="rounded-xl bg-brand-50 p-3">
              <ColorField value={s.color} fallback={s.alertColor ?? DEFAULT_COLOR} presets={PRESET_COLORS}
                label={t("color")} codeLabel={t("colorCode")} resetLabel={t("colorReset")} defaultLabel={t("colorDefault")}
                onSave={(hex) => void run(async () => ((await assetForm({ kind: "goalColor", color: hex })) ? json("/api/goal") : null))}
                onReset={() => void run(async () => ((await assetForm({ kind: "goalColor", remove: "1" })) ? json("/api/goal") : null))} />
            </div>
          </section>
      </FeaturePreviewLayout>

      <ConfirmDialog open={resetOpen} message={t("newRoundConfirm")} confirmLabel={t("newRound")} busy={busy}
        onConfirm={async () => { setBusy(true); await run(async () => ((await assetForm({ kind: "goalReset" })) ? json("/api/goal") : null)); setBusy(false); setResetOpen(false); }}
        onCancel={() => setResetOpen(false)} />
      <ConfirmDialog open={deleting !== null} message={deleting ? deleteMessage(deleting) : ""} confirmLabel={t("deleteItem")} danger busy={busy}
        onConfirm={remove} onCancel={() => setDeleting(null)} />
    </FeatureSettingsLayout>
  );
}
