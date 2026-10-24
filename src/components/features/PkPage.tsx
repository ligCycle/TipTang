"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Switch } from "@/components/features/FeatureCard";
import { FeatureSettingsLayout } from "@/components/features/FeaturePages";
import { FeaturePreviewLayout } from "@/components/features/PreviewPanel";
import { PkPreview } from "@/components/features/FeaturePreviews";
import { barShare, DEFAULT_SIDES, MAX_SIDE_NAME, PK_DURATIONS, remainingSec } from "@/lib/pk";
import type { PkFeed } from "@/lib/pk-server";

type HistoryRow = {
  id: string;
  kind: string;
  status: string;
  nameA: string;
  nameB: string;
  colorA: string;
  colorB: string;
  totalA: number | null;
  totalB: number | null;
  startedAt: string | null;
  endedAt: string | null;
  winner: "A" | "B" | "draw" | null;
};
type Invite = { id: string; name: string; durationSec: number; createdAt: string };
type PkState = {
  enabled: boolean;
  graceSec: number;
  current: PkFeed | null;
  history: HistoryRow[];
  invitesOff: boolean;
  invites: { incoming: Invite[]; outgoing: Invite[] };
};

const REFRESH_MS = 3000;

async function fetchPk(): Promise<PkState | null> {
  const res = await fetch("/api/pk", { cache: "no-store" }).catch(() => null);
  return res?.ok ? res.json() : null;
}

function clock(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/**
 * "PK" (two sides in one stream): start a timed match with two named sides,
 * watch the live totals, end it early, and see past results. Fans choose a
 * side on the donate page while it runs.
 */
export function PkPage() {
  const t = useTranslations("pkPage");
  const tHub = useTranslations("featureHub");
  const locale = useLocale();
  const [data, setData] = useState<PkState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ ...DEFAULT_SIDES, durationSec: 300 as number });
  const [test, setTest] = useState<"sent" | "failed" | null>(null);
  // Creator vs creator: who to invite and for how long.
  const [invite, setInvite] = useState({ username: "", durationSec: 300 as number });
  const [now, setNow] = useState(() => Date.now());
  // Server clock minus this browser's, recorded when each refresh arrives.
  const [skew, setSkew] = useState(0);

  function apply(d: PkState | null) {
    if (!d) return;
    if (d.current) setSkew(new Date(d.current.serverNow).getTime() - Date.now());
    setData(d);
  }

  useEffect(() => {
    fetchPk().then(apply);
    const id = setInterval(() => fetchPk().then(apply), REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearInterval(id);
      clearInterval(tick);
    };
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    const fd = new FormData();
    fd.append("kind", "pkToggle");
    fd.append("enabled", next ? "1" : "0");
    const res = await fetch("/api/overlay/asset", { method: "POST", body: fd }).catch(() => null);
    setError(res?.ok ? null : t("saveFailed"));
    const d = await fetchPk();
    if (d) setData(d);
    setBusy(false);
  }

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/pk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    const body = res && !res.ok ? await res.json().catch(() => null) : null;
    if (!res?.ok) setError(body?.error === "busy" ? t("busy") : body?.error === "off" ? t("turnOnFirst") : t("saveFailed"));
    const d = await fetchPk();
    if (d) setData(d);
    setBusy(false);
  }

  async function call(url: string, method: string, body: unknown, errorFor: (code?: string) => string) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => null) : null;
      setError(errorFor(d?.error));
    }
    apply(await fetchPk());
    setBusy(false);
    return Boolean(res?.ok);
  }

  async function sendInvite() {
    const ok = await call("/api/pk/invite", "POST", invite, (code) =>
      code === "busy" ? t("tooManyInvites") : code === "off" ? t("turnOnFirst") : code === "rate_limited" ? t("slowDown") : t("cantInvite"),
    );
    if (ok) setInvite((v) => ({ ...v, username: "" }));
  }

  async function endNow() {
    setBusy(true);
    const res = await fetch("/api/pk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end" }),
    }).catch(() => null);
    if (!res?.ok) setError(t("saveFailed"));
    const d = await fetchPk();
    if (d) setData(d);
    setBusy(false);
  }

  if (!data) return null;
  const m = data.current;
  const left = m ? remainingSec(new Date(m.endsAt), new Date(now + skew)) : 0;
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale === "th" ? "th-TH" : "en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) : "";

  async function testOnObs() {
    setTest(null);
    const res = await fetch("/api/pk/test", { method: "POST" }).catch(() => null);
    setTest(res?.ok ? "sent" : "failed");
  }

  return (
    <FeatureSettingsLayout
      title={tHub("f_pk")}
      headerExtra={
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-900/75">
          {tHub("enable")}
          <Switch checked={data.enabled} onChange={toggle} label={tHub("f_pk")} disabled={busy} />
        </span>
      }
      obs={{ feature: "pk", onTest: testOnObs, testState: test }}
    >
      <FeaturePreviewLayout preview={<PkPreview match={m} now={now + skew} />}>
      <p className="text-sm text-brand-900/65">{t("howItWorks")}</p>
      <p className="text-xs text-brand-900/55">{t("graceNote", { min: Math.round((m?.graceSec || data.graceSec) / 60) })}</p>
      {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}

      {m && m.kind === "solo" ? (
        <section className="space-y-3 rounded-2xl border border-brand-200 p-4">
          <h2 className="font-bold text-brand-900">① {m.phase === "ended" ? t("result") : t("live")}</h2>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold" style={{ color: m.colorA }}>{m.nameA}</p>
              <p className="text-2xl font-extrabold tabular-nums text-brand-900">฿{m.totalA.toLocaleString()}</p>
            </div>
            <p className="shrink-0 text-center text-sm font-semibold text-brand-900/70">
              {m.phase === "live" ? clock(left) : m.phase === "grace" ? t("graceNow") : m.winner === "draw" ? t("draw") : t("wins", { name: m.winner === "A" ? m.nameA : m.nameB })}
            </p>
            <div className="min-w-0 text-right">
              <p className="truncate font-bold" style={{ color: m.colorB }}>{m.nameB}</p>
              <p className="text-2xl font-extrabold tabular-nums text-brand-900">฿{m.totalB.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex h-4 overflow-hidden rounded-full bg-brand-100">
            <div className="h-full transition-[width] duration-700" style={{ width: `${barShare(m.totalA, m.totalB)}%`, background: m.colorA }} />
            <div className="h-full flex-1" style={{ background: m.colorB }} />
          </div>
          {m.phase === "live" && m.kind === "solo" && (
            <button type="button" onClick={endNow} disabled={busy} className="btn-secondary px-4 py-2 text-sm">
              {t("endNow")}
            </button>
          )}
        </section>
      ) : m && m.kind === "duo" ? (
        <section className="space-y-3 rounded-2xl border border-brand-200 p-4">
          <h2 className="font-bold text-brand-900">① {m.phase === "ended" ? t("result") : t("duoLive")}</h2>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold" style={{ color: m.colorA }}>{m.nameA}</p>
              <p className="text-2xl font-extrabold tabular-nums text-brand-900">฿{m.totalA.toLocaleString()}</p>
            </div>
            <p className="shrink-0 text-center text-sm font-semibold text-brand-900/70">
              {m.phase === "live" ? clock(left) : m.phase === "grace" ? t("graceNow") : m.winner === "draw" ? t("draw") : t("wins", { name: m.winner === "A" ? m.nameA : m.nameB })}
            </p>
            <div className="min-w-0 text-right">
              <p className="truncate font-bold" style={{ color: m.colorB }}>{m.nameB}</p>
              <p className="text-2xl font-extrabold tabular-nums text-brand-900">฿{m.totalB.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex h-4 overflow-hidden rounded-full bg-brand-100">
            <div className="h-full transition-[width] duration-700" style={{ width: `${barShare(m.totalA, m.totalB)}%`, background: m.colorA }} />
            <div className="h-full flex-1" style={{ background: m.colorB }} />
          </div>
          <p className="text-xs text-brand-900/55">{t("duoCounting")}</p>
          {m.phase !== "ended" && (
            <button
              type="button"
              onClick={() => void call(`/api/pk/${m.id}`, "PATCH", { action: "cancel" }, () => t("saveFailed"))}
              disabled={busy}
              className="btn-secondary px-4 py-2 text-sm"
            >
              {t("cancelMatch")}
            </button>
          )}
        </section>
      ) : (
        <section className="space-y-4 rounded-2xl border border-brand-200 p-4">
          <h2 className="font-bold text-brand-900">① {t("newMatch")}</h2>
          {(["A", "B"] as const).map((side) => (
            <div key={side} className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={side === "A" ? form.colorA : form.colorB}
                onChange={(e) => setForm((f) => ({ ...f, [side === "A" ? "colorA" : "colorB"]: e.target.value }))}
                aria-label={t("colorOf", { side: side === "A" ? form.nameA : form.nameB })}
                className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-brand-200 bg-transparent"
              />
              <input
                value={side === "A" ? form.nameA : form.nameB}
                onChange={(e) => setForm((f) => ({ ...f, [side === "A" ? "nameA" : "nameB"]: e.target.value }))}
                maxLength={MAX_SIDE_NAME}
                aria-label={t(side === "A" ? "nameA" : "nameB")}
                className="input min-w-0 flex-1"
              />
            </div>
          ))}
          <div>
            <span className="mb-1 block text-sm font-medium text-brand-900/80">{t("duration")}</span>
            <div className="inline-flex overflow-hidden rounded-full border border-brand-300" role="radiogroup" aria-label={t("duration")}>
              {PK_DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={form.durationSec === d}
                  onClick={() => setForm((f) => ({ ...f, durationSec: d }))}
                  className={`px-3.5 py-1.5 text-sm font-semibold ${form.durationSec === d ? "bg-brand-600 text-white" : "text-brand-800 hover:bg-brand-100"}`}
                >
                  {t("minutes", { n: d / 60 })}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={start} disabled={busy || !data.enabled} className="btn-primary px-4 py-2 text-sm">
            {t("start")}
          </button>
          {!data.enabled && <p className="text-xs text-brand-900/55">{t("turnOnFirst")}</p>}
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-brand-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-brand-900">② {t("duoTitle")}</h2>
          <span className="flex items-center gap-2 text-xs font-semibold text-brand-900/70">
            {t("invitesOff")}
            <Switch
              checked={data.invitesOff}
              onChange={(next) => void call("/api/pk", "PATCH", { invitesOff: next }, () => t("saveFailed"))}
              label={t("invitesOff")}
              disabled={busy}
            />
          </span>
        </div>
        <p className="text-xs text-brand-900/55">{t("duoHow")}</p>
        {data.invites.incoming.length > 0 && (
          <ul className="space-y-1.5">
            {data.invites.incoming.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-brand-400 bg-brand-50 px-3 py-2 text-sm">
                <span className="font-semibold text-brand-900">{t("invitedBy", { name: i.name, min: i.durationSec / 60 })}</span>
                <span className="flex gap-1.5">
                  <button type="button" disabled={busy || !!m} onClick={() => void call(`/api/pk/${i.id}`, "PATCH", { action: "accept" }, (c) => (c === "busy" ? t("busy") : c === "off" ? t("turnOnFirst") : t("inviteGone")))} className="btn-primary px-3 py-1 text-xs">
                    {t("accept")}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void call(`/api/pk/${i.id}`, "PATCH", { action: "decline" }, () => t("inviteGone"))} className="btn-secondary px-3 py-1 text-xs">
                    {t("decline")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        {data.invites.outgoing.length > 0 && (
          <ul className="space-y-1.5">
            {data.invites.outgoing.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 px-3 py-2 text-sm">
                <span className="text-brand-900/80">{t("waitingFor", { name: i.name, min: i.durationSec / 60 })}</span>
                <button type="button" disabled={busy} onClick={() => void call(`/api/pk/${i.id}`, "PATCH", { action: "cancel" }, () => t("saveFailed"))} className="text-xs font-semibold text-brand-700 hover:underline">
                  {t("withdraw")}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!m && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (invite.username.trim()) void sendInvite();
            }}
          >
            <input
              value={invite.username}
              onChange={(e) => setInvite((v) => ({ ...v, username: e.target.value }))}
              placeholder={t("inviteUsername")}
              aria-label={t("inviteUsername")}
              className="input min-w-0 flex-1"
              maxLength={40}
            />
            <select
              value={invite.durationSec}
              onChange={(e) => setInvite((v) => ({ ...v, durationSec: Number(e.target.value) }))}
              aria-label={t("duration")}
              className="input w-28!"
            >
              {PK_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {t("minutes", { n: d / 60 })}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busy || !data.enabled} className="btn-primary px-4 py-2 text-sm">
              {t("invite")}
            </button>
          </form>
        )}
      </section>

      {data.history.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-brand-200 p-4">
          <h2 className="font-bold text-brand-900">③ {t("history")}</h2>
          <ul className="space-y-1.5 text-sm">
            {data.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 px-3 py-2">
                <span className="min-w-0">
                  <span className="font-semibold" style={{ color: h.colorA }}>{h.nameA}</span> ฿{(h.totalA ?? 0).toLocaleString()}
                  <span className="text-brand-900/50"> · </span>
                  <span className="font-semibold" style={{ color: h.colorB }}>{h.nameB}</span> ฿{(h.totalB ?? 0).toLocaleString()}
                </span>
                <span className="text-xs text-brand-900/60">
                  {h.status === "CANCELLED" ? t("cancelled") : h.winner === "draw" ? t("draw") : t("wins", { name: h.winner === "A" ? h.nameA : h.nameB })} · {fmt(h.endedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      </FeaturePreviewLayout>
    </FeatureSettingsLayout>
  );
}
