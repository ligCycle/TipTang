"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { relativeTime } from "@/lib/format";
import { FEATURES, type FeatureId } from "@/lib/feature-registry";
import { linkStatus, type LinkStatus } from "@/lib/obs-status";

const POLL_MS = 15_000;

export type ObsTimes = {
  /** The alerts link before the main link existed: counts as "placed" (final review I2). */
  lastSeenAt: string | null;
  mainSeenAt: string | null;
  barsSeenAt: string | null;
  comboSeenAt: string | null;
  mediaSeenAt: string | null;
  bossSeenAt: string | null;
};

/** When the two links (and the features' own links) were last loaded; re-read every 15 s. */
export function useObsTimes(): ObsTimes | null {
  const [times, setTimes] = useState<ObsTimes | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/overlay/status", { cache: "no-store" });
        if (res.ok && active) setTimes((await res.json()) as ObsTimes);
      } catch {
        // try again on the next tick
      }
    }
    void load();
    const id = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  return times;
}


/** Which "last loaded" times count for a feature: its link(s), plus its own link where it has one (S7). */
export function timesFor(id: FeatureId, t: ObsTimes): (string | null)[] {
  const f = FEATURES.find((x) => x.id === id);
  const out: (string | null)[] = [];
  if (f?.stage.includes("main")) out.push(t.mainSeenAt);
  if (f?.stage.includes("bars")) out.push(t.barsSeenAt);
  if (id === "combo") out.push(t.comboSeenAt);
  if (id === "media" || id === "voice") out.push(t.mediaSeenAt);
  if (id === "boss") out.push(t.bossSeenAt);
  return out;
}

export function StatusBadge({ status }: { status: LinkStatus }) {
  const t = useTranslations("featureHub");
  const lang = useLocale() === "en" ? "en" : "th";
  const cls =
    status.state === "live"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : status.state === "seen"
        ? "bg-brand-900/10 text-brand-900/70"
        : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  const dot = status.state === "live" ? "bg-emerald-500" : status.state === "seen" ? "bg-brand-900/40" : "bg-amber-500";
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      {status.state === "live"
        ? t("statusLive")
        : status.state === "seen" && status.at
          ? t("statusSeen", { when: relativeTime(status.at, new Date(), lang) })
          : t("statusNever")}
    </span>
  );
}

/**
 * The same strip under every feature page's title: which OBS link the
 * feature shows on, whether that link is loaded, where to get it (the hub's
 * "เชื่อม OBS" card) and the page's test button.
 */
export function ObsBar({
  feature,
  onTest,
  testState,
}: {
  feature: FeatureId;
  onTest?: () => void;
  /** Result of the last test press. */
  testState?: "sent" | "failed" | null;
}) {
  const t = useTranslations("featureHub");
  const locale = useLocale();
  const times = useObsTimes();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), POLL_MS);
    return () => clearInterval(id);
  }, []);
  const f = FEATURES.find((x) => x.id === feature);
  if (!f) return null;
  const status = times ? linkStatus(timesFor(feature, times), now, f.stage.includes("main") ? times.lastSeenAt : null) : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-2.5 text-sm">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-brand-900/75">{t("showsOn")}</span>
        {f.stage.map((s) => (
          <span key={s} className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold text-white">
            {s === "main" ? t("linkMain") : t("linkBars")}
          </span>
        ))}
      </span>
      {status && <StatusBadge status={status} />}
      <Link href={`/${locale}/dashboard/features#obs`} className="text-xs font-semibold text-brand-700 underline">
        {status?.state === "never" ? t("howToPlace") : t("getLinks")}
      </Link>
      {onTest && (
        <span className="ml-auto flex items-center gap-2">
          {testState && (
            <span className={`text-xs ${testState === "sent" ? "text-emerald-700" : "text-red-600"}`} role="status">
              {testState === "sent" ? t("testSentObs") : t("testFailedObs")}
            </span>
          )}
          <button type="button" onClick={onTest} className="btn-primary px-4 py-1.5 text-sm">
            {t("testOnObs")}
          </button>
        </span>
      )}
    </div>
  );
}
