"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCard } from "@/components/overlay/AlertCard";
import { pickTier, resolveAlert, celebrates, pickNormal, type AlertTier } from "@/lib/alert-tiers";
import { poolsForAmount, type NormalMedia } from "@/lib/alert-sets";
import { useSoundSets } from "@/components/features/useSoundSets";
import { formatBaht } from "@/lib/format";
import type { OverlayConfig } from "@/components/OverlaySettings";

const AMOUNTS = [20, 500];
const OBS_SEEN_WINDOW_MS = 5 * 60_000;

/**
 * Left column of the alert settings page: the card as it will look for a
 * chosen amount (tiers applied), and "Test on OBS", which puts a sample on
 * the creator's real overlay without creating a tip.
 */
export function AlertPreview({ config, tiers = [] }: { config: OverlayConfig; tiers?: AlertTier[] }) {
  const t = useTranslations("featureHub");
  const [amount, setAmount] = useState(AMOUNTS[0]);
  const { active } = useSoundSets();
  const [status, setStatus] = useState<"sent" | "noObs" | "failed" | null>(null);
  const [sending, setSending] = useState(false);

  const library = new Set([
    ...config.librarySounds.map((i) => i.url),
    ...config.libraryStickers.map((i) => i.url),
    ...config.libraryVideos.map((i) => i.url),
  ]);
  // The active set's media for this amount; the preview shows the first
  // (the overlay picks one at random each time).
  const items = new Map((active?.items ?? []).map((i) => [i.assetId, i]));
  const inSet = <T extends { id: string }>(list: T[]) => list.filter((f) => items.has(f.id));
  const normal: NormalMedia = {
    sounds: inSet(config.librarySounds).map((f) => ({ url: f.url, minAmount: items.get(f.id)?.minAmount ?? 0 })),
    images: inSet(config.libraryStickers).map((f) => f.url),
    videos: inSet(config.libraryVideos).map((f) => f.url),
  };
  const media = resolveAlert(
    { ...pickNormal(poolsForAmount(normal, amount), () => 0), durationSec: 7 },
    pickTier(tiers, amount),
    library,
  );
  const isBig = celebrates(tiers, amount);

  async function test() {
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch("/api/overlay/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) throw new Error();
      const seen = config.lastSeenAt ? Date.parse(config.lastSeenAt) : 0;
      setStatus(Date.now() - seen < OBS_SEEN_WINDOW_MS ? "sent" : "noObs");
    } catch {
      setStatus("failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-brand-900">{t("previewTitle")}</p>
      <div className="flex min-h-48 items-center justify-center rounded-2xl bg-[#0b1220] p-4">
        <div className="w-full max-w-sm">
          <AlertCard
            // Replays the entrance whenever the amount, media, look or effect changes.
            key={`${amount}-${media.imageUrl}-${media.videoUrl}-${config.alertStyle}-${config.alertTheme}-${config.color}`}
            name={t("sampleName")}
            amount={amount}
            message={t("sampleMessage")}
            color={config.color}
            alertStyle={config.alertStyle}
            alertTheme={config.alertTheme}
            isBig={isBig}
            imageUrl={media.videoUrl ? null : media.imageUrl}
            videoUrl={media.videoUrl}
            loop
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={test} disabled={sending} className="btn-primary px-4 py-2 text-sm">
          {t("testOnObs")}
        </button>
        {AMOUNTS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAmount(a)}
            aria-pressed={amount === a}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              amount === a ? "border-tip-500 bg-tip-50 text-tip-700" : "border-brand-200 text-brand-900/70"
            }`}
          >
            {t("tryAmount", { amount: formatBaht(a) })}
          </button>
        ))}
      </div>
      {status && (
        <p
          className={`text-sm font-medium ${status === "failed" ? "text-red-600" : status === "noObs" ? "text-tip-700" : "text-brand-700"}`}
          aria-live="polite"
        >
          {status === "sent" ? t("testSent") : status === "noObs" ? t("testNoObs") : t("testFailed")}
        </p>
      )}
      <p className="text-xs text-brand-900/55">{t("testNote")}</p>
    </div>
  );
}
