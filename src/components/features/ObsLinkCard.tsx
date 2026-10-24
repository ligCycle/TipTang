"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { FEATURES } from "@/lib/feature-registry";
import type { FeatureFlags } from "@/lib/feature-presets";
import { StatusBadge, statusOf, useObsTimes } from "@/components/features/ObsBar";

/**
 * "เชื่อม OBS" at the top of the hub — the one place the OBS links are
 * pasted from (spec docs/superpowers/specs/2026-10-24-obs-two-links-design.md):
 * the main link (every popup), the bars link (every bar), the optional to-do
 * link, the setup guide, a new key, and the per-feature links folded away
 * for creators who place each one themselves.
 */
export function ObsLinkCard({
  overlayBase,
  overlayKey,
  flags,
  onKey,
}: {
  overlayBase: string;
  overlayKey: string;
  flags: FeatureFlags;
  /** A new key was made: every link changes. */
  onKey: (key: string) => void;
}) {
  const t = useTranslations("featureHub");
  const tDash = useTranslations("dashboard");
  const times = useObsTimes();
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [rotated, setRotated] = useState<"ok" | "error" | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const link = (path: string) => `${overlayBase}${path}?key=${overlayKey}`;
  const names = (stage: "main" | "bars") =>
    FEATURES.filter((f) => f.stage.includes(stage) && flags[f.flag] && f.id !== "soundpick").map((f) => t(`f_${f.id}`));

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  // New key → every link (main, bars, to-do and each feature's own) changes;
  // the old ones stop working immediately.
  async function rotateKey() {
    if (!window.confirm(tDash("obsRotateConfirm"))) return;
    setRotating(true);
    setRotated(null);
    try {
      const res = await fetch("/api/overlay/key", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.key) throw new Error();
      onKey(d.key);
      setRotated("ok");
    } catch {
      setRotated("error");
    } finally {
      setRotating(false);
    }
  }

  const copyButton = (url: string, label = t("copy")) => (
    <button
      type="button"
      onClick={() => copy(url)}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
    >
      <Icon name="link" className="h-3.5 w-3.5" />
      {copied === url ? t("copied") : label}
    </button>
  );

  const row = (
    title: string,
    what: string,
    on: string[] | null,
    url: string,
    size: string,
    seen: (string | null)[] | null,
  ) => (
    <li className="space-y-1.5 rounded-xl border border-brand-200 bg-white/60 p-3 dark:bg-transparent">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-brand-900">{title}</span>
        <span className="text-xs text-brand-900/60">{what}</span>
        {seen && times && <StatusBadge status={statusOf(seen, now)} />}
      </div>
      {on && (
        <p className="text-xs text-brand-900/70">
          {on.length > 0 ? t("onLinkNow", { list: on.join(" · ") }) : t("onLinkNone")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {copyButton(url)}
        <span className="text-xs text-brand-900/50">{size}</span>
      </div>
    </li>
  );

  return (
    <section id="obs" className="scroll-mt-4 rounded-2xl border-2 border-brand-400 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <Icon name="monitor" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold text-brand-900">{t("obsTitle")}</h2>
          <p className="text-sm text-brand-900/65">{t("obsLine")}</p>
          <p className="text-xs text-brand-900/50">{t("obsSize")}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {row(t("linkMain"), t("linkMainWhat"), names("main"), link(""), t("sizeMain"), times ? [times.mainSeenAt] : null)}
        {row(t("linkBars"), t("linkBarsWhat"), names("bars"), link("/bars"), t("sizeBars"), times ? [times.barsSeenAt] : null)}
        {row(t("linkTodo"), t("linkTodoWhat"), null, link("/todo"), t("sizeTodo"), null)}
      </ul>
      <p className="mt-2 text-xs text-brand-900/55">{t("keepSecret")}</p>

      <details className="mt-3 rounded-xl border border-brand-200 bg-brand-50/70">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-semibold text-brand-800">
          <Icon name="book-open" />
          {tDash("obsGuideTitle")}
        </summary>
        <ol className="list-decimal space-y-1.5 pb-3 pl-9 pr-3 text-xs text-brand-900/70">
          <li>{tDash("obsGuideStep1")}</li>
          <li>{tDash("obsGuideStep2")}</li>
          <li>{tDash("obsGuideStep3")}</li>
          <li>{tDash("obsGuideStep4")}</li>
          <li>{tDash("obsGuideStep5")}</li>
        </ol>
        <p className="flex items-start gap-2 px-3 pb-3 text-xs text-brand-600">
          <Icon name="lightbulb" className="mt-px h-3.5 w-3.5" />
          <span>{tDash("obsGuideNote")}</span>
        </p>
      </details>
      <details className="mt-2 rounded-xl border border-brand-200 bg-brand-50/70">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-semibold text-brand-800">
          <Icon name="monitor" />
          {tDash("obsOtherTitle")}
        </summary>
        <ul className="list-disc space-y-1.5 pb-3 pl-9 pr-3 text-xs text-brand-900/70">
          <li>{tDash("obsOtherStreamlabs")}</li>
          <li>{tDash("obsOtherTiktok")}</li>
          <li>{tDash("obsOtherPrism")}</li>
          <li>{tDash("obsOtherMobile")}</li>
        </ul>
      </details>
      <details className="mt-2 rounded-xl border border-brand-200 bg-brand-50/70">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-semibold text-brand-800">
          <Icon name="settings" />
          {t("advancedTitle")}
        </summary>
        <div className="space-y-2 px-3 pb-3">
          <p className="text-xs text-brand-900/65">{t("advancedHint")}</p>
          <ul className="space-y-1.5">
            {FEATURES.filter((f) => f.obsPath !== null).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="min-w-28 font-semibold text-brand-900">{t(`f_${f.id}`)}</span>
                {copyButton(link(f.obsPath ?? ""), t("copyObs"))}
                <span className="text-xs text-brand-900/50">{t("obsSizeOf", { size: f.obsSize })}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-brand-900/55">{tDash("obsRotateHint")}</span>
        <button
          type="button"
          onClick={rotateKey}
          disabled={rotating}
          className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline disabled:opacity-50"
        >
          <Icon name="refresh" className="h-3.5 w-3.5" />
          {tDash("obsRotate")}
        </button>
        {rotated === "ok" && (
          <span className="font-medium text-emerald-700" role="status">
            {tDash("obsRotated")}
          </span>
        )}
        {rotated === "error" && (
          <span className="font-medium text-red-600" role="status">
            {tDash("obsRotateFailed")}
          </span>
        )}
      </div>
    </section>
  );
}
