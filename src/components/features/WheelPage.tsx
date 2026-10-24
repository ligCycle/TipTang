"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/features/FeatureCard";
import { FeatureSettingsLayout } from "@/components/features/FeaturePages";
import { AutoSaveInput } from "@/components/features/LibraryBits";
import { WheelPreview } from "@/components/features/WheelPreview";
import { WheelRulesDialog, WheelTemplatePicker } from "@/components/features/WheelRulesDialog";
import { SpinTodo } from "@/components/features/SpinTodo";
import { loadHub, type HubState } from "@/components/features/FeatureHub";
import { MAX_NAME } from "@/lib/alert-sets";
import {
  clampSlots,
  cleanWheelPrice,
  MAX_SEGMENTS,
  MAX_SLOTS,
  MAX_TASK_TEXT,
  MAX_TASKS,
  MAX_WHEELS,
  MIN_TASKS,
  taskOdds,
} from "@/lib/wheel";
import type { WheelDto } from "@/lib/wheel-server";

type WheelsData = { activeWheelId: string | null; wheelEnabled: boolean; rulesAccepted: boolean; wheels: WheelDto[] };

async function fetchWheels(): Promise<WheelsData> {
  const res = await fetch("/api/wheels");
  if (!res.ok) throw new Error();
  return res.json();
}

async function patchWheel(id: string, body: Record<string, unknown>): Promise<WheelDto | null> {
  const res = await fetch(`/api/wheels/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => null);
  return res.ok && d?.wheel ? d.wheel : null;
}

/**
 * The wheel page ("วงล้อสุ่ม"): on/off (behind the rules checklist the first
 * time), one tab per wheel, the editor with a live preview, the two OBS
 * links and the to-do list.
 */
export function WheelPage() {
  const t = useTranslations("wheel");
  const tHub = useTranslations("featureHub");
  const [data, setData] = useState<WheelsData | null>(null);
  const [hub, setHub] = useState<HubState | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload(selectId?: string) {
    const d = await fetchWheels();
    setData(d);
    setTab((cur) => selectId ?? (cur && d.wheels.some((w) => w.id === cur) ? cur : (d.activeWheelId ?? d.wheels[0]?.id ?? null)));
    return d;
  }

  useEffect(() => {
    fetchWheels()
      .then((d) => {
        setData(d);
        setTab(d.activeWheelId ?? d.wheels[0]?.id ?? null);
      })
      .catch(() => setError("load"));
    loadHub().then(setHub);
  }, []);

  if (!data) {
    return error ? <p className="text-sm text-red-600">{t("saveFailed")}</p> : null;
  }

  async function toggle(next: boolean) {
    if (!data) return;
    setError(null);
    if (next && !data.rulesAccepted) {
      setRulesOpen(true);
      return;
    }
    setToggling(true);
    setData({ ...data, wheelEnabled: next });
    try {
      const fd = new FormData();
      fd.append("kind", "wheelToggle");
      fd.append("enabled", next ? "1" : "0");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      if (res.status === 409) {
        setData({ ...data, wheelEnabled: false });
        setRulesOpen(true);
      } else if (!res.ok) throw new Error();
    } catch {
      setData({ ...data, wheelEnabled: !next });
      setError(tHub("toggleFailed"));
    } finally {
      setToggling(false);
    }
  }

  const current = data.wheels.find((w) => w.id === tab) ?? null;
  const tabClass = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
      on ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-800 hover:bg-brand-200"
    }`;

  return (
    <FeatureSettingsLayout
      title={tHub("f_wheel")}
      headerExtra={
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-900/75">
          {tHub("enable")}
          <Switch checked={data.wheelEnabled} onChange={toggle} label={tHub("f_wheel")} disabled={toggling} />
        </span>
      }
      obs={{ feature: "wheel" }}
    >
      <p className="text-sm text-brand-900/65">{t("pageDesc")}</p>
      {!data.wheelEnabled && (
        <p className="rounded-xl bg-tip-50 px-3 py-2 text-sm font-medium text-tip-700">{t("offNote")}</p>
      )}
      {error && error !== "load" && <p className="text-sm font-medium text-red-600">{error}</p>}

      {data.wheels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-300 p-6 text-center">
          <p className="text-sm text-brand-900/65">{t("noWheels")}</p>
          <button type="button" onClick={() => setPicking(true)} className="btn-primary mt-3 px-4 py-2 text-sm">
            {t("pickTitle")}
          </button>
        </div>
      ) : (
        <>
          <nav className="flex flex-wrap gap-1.5" aria-label={tHub("f_wheel")}>
            {data.wheels.map((w) => (
              <button key={w.id} type="button" onClick={() => setTab(w.id)} className={tabClass(tab === w.id)}>
                {w.name}
                {w.id === data.activeWheelId && (
                  <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">{t("inUse")}</span>
                )}
              </button>
            ))}
            {data.wheels.length < MAX_WHEELS ? (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="rounded-full border border-dashed border-brand-400 px-3.5 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
              >
                {t("newWheel")}
              </button>
            ) : (
              <span className="self-center text-xs text-brand-900/55">{t("tooMany")}</span>
            )}
          </nav>
          {current && (
            <WheelEditor
              key={current.id}
              wheel={current}
              active={current.id === data.activeWheelId}
              hub={hub}
              onSaved={(w) => setData((d) => (d ? { ...d, wheels: d.wheels.map((x) => (x.id === w.id ? w : x)) } : d))}
              onActivated={() => setData((d) => (d ? { ...d, activeWheelId: current.id } : d))}
              onDeleted={() => void reload()}
            />
          )}
        </>
      )}

      <SpinTodo />

      {rulesOpen && (
        <WheelRulesDialog
          onCancel={() => setRulesOpen(false)}
          onAccepted={() => {
            setRulesOpen(false);
            setData((d) => (d ? { ...d, wheelEnabled: true, rulesAccepted: true } : d));
            if (data.wheels.length === 0) setPicking(true);
          }}
        />
      )}
      {picking && (
        <WheelTemplatePicker
          onCancel={() => setPicking(false)}
          onCreated={async (id) => {
            setPicking(false);
            await reload(id);
          }}
        />
      )}
    </FeatureSettingsLayout>
  );
}

const SLOT_SAVE_MS = 400;

function WheelEditor({
  wheel: initial,
  active,
  hub,
  onSaved,
  onActivated,
  onDeleted,
}: {
  wheel: WheelDto;
  active: boolean;
  hub: HubState | null;
  onSaved: (w: WheelDto) => void;
  onActivated: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("wheel");
  const [wheel, setWheel] = useState(initial);
  const [slots, setSlots] = useState(initial.slots);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<"sent" | "empty" | "failed" | null>(null);
  // Latest saved wheel, so several quick edits each build on the newest task list.
  const latest = useRef(initial);
  const slotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(body: Record<string, unknown>): Promise<boolean> {
    const w = await patchWheel(wheel.id, body);
    if (!w) {
      setError(true);
      return false;
    }
    setError(false);
    latest.current = w;
    setWheel(w);
    setSlots(w.slots);
    onSaved(w);
    return true;
  }

  // Task edits replace the whole list, so they run one at a time: each builds
  // on the list the previous save returned (two rows edited quickly both stick).
  const taskQueue = useRef<Promise<unknown>>(Promise.resolve());
  function saveTasks(change: (tasks: WheelDto["tasks"]) => { id?: string; text: string; noAction: boolean }[]) {
    const run = taskQueue.current.then(() => save({ tasks: change(latest.current.tasks) }));
    taskQueue.current = run.catch(() => {});
    return run;
  }

  const maxSlots = clampSlots(wheel.tasks.length, MAX_SLOTS);
  const total = wheel.tasks.length * slots;
  const odds = taskOdds(wheel.tasks, slots, wheel.removed);

  function changeSlots(next: number) {
    const s = Math.min(next, maxSlots);
    setSlots(s);
    if (slotTimer.current) clearTimeout(slotTimer.current);
    slotTimer.current = setTimeout(() => void save({ slots: s }), SLOT_SAVE_MS);
  }

  async function activate() {
    setBusy(true);
    try {
      if (await save({ activate: true })) onActivated();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/wheels/${wheel.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDeleting(false);
      onDeleted();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function testOnObs() {
    setTest(null);
    const res = await fetch("/api/wheels/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wheelId: wheel.id }),
    }).catch(() => null);
    setTest(res?.ok ? "sent" : res?.status === 409 ? "empty" : "failed");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {active ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">{t("inUseLong")}</span>
          ) : (
            <>
              <button type="button" onClick={activate} disabled={busy} className="btn-primary px-4 py-1.5 text-sm">
                {t("useThis")}
              </button>
              <button
                type="button"
                onClick={() => setDeleting(true)}
                disabled={busy}
                className="text-xs font-semibold text-red-600 hover:underline"
              >
                {t("deleteWheel")}
              </button>
            </>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-brand-900/75">{t("name")}</span>
            <AutoSaveInput value={wheel.name} ariaLabel={t("name")} maxLength={MAX_NAME} save={(v) => save({ name: v })} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-brand-900/75">{t("price")}</span>
            <AutoSaveInput
              value={String(wheel.price)}
              ariaLabel={t("price")}
              inputMode="numeric"
              save={async (v) => cleanWheelPrice(v) !== null && save({ price: cleanWheelPrice(v) })}
            />
            <span className="mt-1 block text-xs text-brand-900/50">{t("priceHint")}</span>
          </label>
        </div>

        <div className="rounded-xl border border-brand-200 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-brand-900">{t("removeWhenHit")}</span>
            <Switch checked={wheel.removeWhenHit} onChange={(v) => void save({ removeWhenHit: v })} label={t("removeWhenHit")} />
          </div>
          <p className="mt-1 text-xs text-brand-900/55">{t("removeWhenHitHint")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save({ reset: true })}
              disabled={wheel.removed.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-300 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-50"
            >
              <Icon name="refresh" className="h-3.5 w-3.5" />
              {t("reset")}
            </button>
            {wheel.removed.length > 0 && (
              <span className="text-xs text-brand-900/60">{t("removedCount", { count: wheel.removed.length })}</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-brand-200 p-3">
          <label className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-brand-900">
            {t("slots")}
            <span className="text-xs font-normal text-brand-900/65">
              {t("slotsTotal", { tasks: wheel.tasks.length, slots, total })}
            </span>
          </label>
          <input
            type="range"
            min={1}
            max={MAX_SLOTS}
            step={1}
            value={slots}
            onChange={(e) => changeSlots(Number(e.target.value))}
            aria-label={t("slots")}
            className="mt-2 w-full accent-brand-600"
          />
          <div className="flex justify-between px-1 text-xs text-brand-900/50">
            {Array.from({ length: MAX_SLOTS }, (_, i) => (
              <span key={i} className={i + 1 > maxSlots ? "opacity-40" : ""}>
                {i + 1}
              </span>
            ))}
          </div>
          <p className="mt-1 text-xs text-brand-900/55">
            {maxSlots < MAX_SLOTS ? t("slotsCapped", { max: maxSlots, limit: MAX_SEGMENTS }) : t("slotsHint")}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-brand-900">{t("tasks", { count: wheel.tasks.length })}</p>
          <ul className="space-y-2">
            {wheel.tasks.map((task) => {
              const left = odds.find((o) => o.taskId === task.id)?.remaining ?? slots;
              return (
                <li
                  key={task.id}
                  className={`flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 p-2 ${left === 0 ? "opacity-50" : ""}`}
                >
                  <AutoSaveInput
                    value={task.text}
                    ariaLabel={t("taskText")}
                    maxLength={MAX_TASK_TEXT}
                    className="min-w-40 flex-1"
                    save={(v) =>
                      v.trim()
                        ? saveTasks((tasks) => tasks.map((x) => (x.id === task.id ? { ...x, text: v } : x)))
                        : Promise.resolve(false)
                    }
                  />
                  <label className="flex items-center gap-1.5 text-xs text-brand-900/70">
                    <input
                      type="checkbox"
                      checked={task.noAction}
                      onChange={(e) =>
                        void saveTasks((tasks) =>
                          tasks.map((x) => (x.id === task.id ? { ...x, noAction: e.target.checked } : x)),
                        )
                      }
                      className="h-4 w-4 accent-brand-600"
                    />
                    {t("noAction")}
                  </label>
                  {left < slots && (
                    <span className="text-xs text-brand-900/60">{t("taskLeft", { left, slots })}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => void saveTasks((tasks) => tasks.filter((x) => x.id !== task.id))}
                    disabled={wheel.tasks.length <= MIN_TASKS}
                    aria-label={t("deleteTask")}
                    className="rounded-lg p-1.5 text-brand-900/50 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          {wheel.tasks.length < MAX_TASKS ? (
            <button
              type="button"
              onClick={() =>
                void saveTasks((tasks) => [...tasks, { text: t("newTaskText", { n: tasks.length + 1 }), noAction: false }])
              }
              className="rounded-full border border-dashed border-brand-400 px-3.5 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              {t("addTask")}
            </button>
          ) : (
            <p className="text-xs text-brand-900/55">{t("tasksMax", { max: MAX_TASKS })}</p>
          )}
        </div>
        {error && <p className="text-sm font-medium text-red-600">{t("saveFailed")}</p>}
      </div>

      {/* Preview first and kept in view, like every feature page (src/components/features/PreviewPanel.tsx). */}
      <div className="order-first space-y-3 lg:sticky lg:top-4">
        <p className="text-sm font-bold text-brand-900">{t("previewTitle")}</p>
        <div className="flex items-center justify-center rounded-2xl bg-[#0b1220] p-4">
          <WheelPreview tasks={wheel.tasks} slots={slots} removed={wheel.removed} className="w-full max-w-72" />
        </div>
        {odds.every((o) => o.remaining === 0) ? (
          <p className="rounded-xl bg-tip-50 px-3 py-2 text-xs font-medium text-tip-700">{t("emptyNote")}</p>
        ) : (
          <p className="text-xs text-brand-900/55">{t("previewHint")}</p>
        )}
        <button type="button" onClick={testOnObs} disabled={!hub} className="btn-primary px-4 py-2 text-sm">
          {t("testOnObs")}
        </button>
        {test && (
          <p className={`text-xs ${test === "sent" ? "text-emerald-700" : "text-red-600"}`}>
            {test === "sent" ? t("testSent") : test === "empty" ? t("emptyNote") : t("saveFailed")}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={deleting}
        message={t("deleteConfirm", { name: wheel.name })}
        confirmLabel={t("deleteWheel")}
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDeleting(false)}
      />
    </div>
  );
}
