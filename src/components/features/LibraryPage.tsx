"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/features/FeatureCard";
import type { AlertTier } from "@/lib/alert-tiers";

type Kind = "sound" | "image" | "video";
type Item = { id: string; url: string; inRandom: boolean; kind: Kind; n: number };

const UPLOAD_KIND: Record<Kind, string> = {
  sound: "librarySound",
  image: "librarySticker",
  video: "libraryVideo",
};

type Raw = { id: string; url: string; inRandom?: boolean };

/** Library files (images, sounds, videos) and the tiers, for the cards' tags. */
async function fetchLibrary(): Promise<{ items: Item[]; tiers: AlertTier[] }> {
  const [setup, tierRes] = await Promise.all([
    fetch("/api/overlay/setup", { method: "POST" }).then((r) => r.json()),
    fetch("/api/overlay/tiers").then((r) => r.json()),
  ]);
  const map = (list: Raw[] | undefined, kind: Kind): Item[] =>
    (list ?? []).map((a, i) => ({ id: a.id, url: a.url, inRandom: a.inRandom !== false, kind, n: i + 1 }));
  return {
    items: [
      ...map(setup.libraryStickers, "image"),
      ...map(setup.librarySounds, "sound"),
      ...map(setup.libraryVideos, "video"),
    ],
    tiers: tierRes.tiers ?? [],
  };
}

function kindOf(file: File): Kind {
  if (file.type.startsWith("audio/")) return "sound";
  if (file.type.startsWith("video/")) return "video";
  return "image";
}

/**
 * Every library file as a card: what it is (play / thumbnail), whether it is
 * picked at random for every alert, and which amount tiers use it.
 */
export function LibraryPage() {
  const t = useTranslations("featureHub");
  const locale = useLocale();
  const [items, setItems] = useState<Item[] | null>(null);
  const [tiers, setTiers] = useState<AlertTier[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await fetchLibrary();
    setItems(d.items);
    setTiers(d.tiers);
  }

  useEffect(() => {
    fetchLibrary()
      .then((d) => {
        setItems(d.items);
        setTiers(d.tiers);
      })
      .catch(() => setItems([]));
  }, []);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("kind", UPLOAD_KIND[kindOf(file)]);
      fd.append("file", file);
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const key = `tierUpErr_${d.error}`;
        setError(t.has(key) ? t(key) : t("tierUpErr"));
        return;
      }
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function setRandom(item: Item, enabled: boolean) {
    setItems((list) => list?.map((x) => (x.id === item.id ? { ...x, inRandom: enabled } : x)) ?? null);
    const fd = new FormData();
    fd.append("kind", "libraryRandom");
    fd.append("assetId", item.id);
    fd.append("enabled", enabled ? "1" : "0");
    const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
    if (!res.ok) {
      setItems((list) => list?.map((x) => (x.id === item.id ? { ...x, inRandom: !enabled } : x)) ?? null);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("kind", UPLOAD_KIND[removing.kind]);
      fd.append("remove", "1");
      fd.append("assetId", removing.id);
      await fetch("/api/overlay/asset", { method: "POST", body: fd });
      setRemoving(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const usedIn = (url: string) =>
    tiers
      .filter((tier) => tier.soundUrl === url || tier.imageUrl === url || tier.videoUrl === url)
      .map((tier) => tier.minAmount);

  const label = (item: Item) =>
    t(item.kind === "sound" ? "tierSoundN" : item.kind === "video" ? "tierVideoN" : "tierImageN", { n: item.n });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-brand-900">{t("libTitle")}</h1>
          <p className="mt-1 text-sm text-brand-900/65">{t("libDesc")}</p>
        </div>
        <label className="btn-primary cursor-pointer px-4 py-2 text-sm">
          <Icon name="upload" className="h-4 w-4" />
          {uploading ? t("libUploading") : t("libUpload")}
          <input
            type="file"
            accept="audio/*,image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
        </label>
      </div>
      <p className="text-xs text-brand-900/55">{t("libLimits")}</p>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      {items === null ? null : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-brand-300 p-6 text-center text-sm text-brand-900/60">
          {t("libEmpty")}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const tierMins = usedIn(item.url);
            return (
              <li key={item.id} className="flex flex-col gap-3 rounded-2xl border border-brand-200 p-3">
                <div className="flex h-32 items-center justify-center overflow-hidden rounded-xl bg-[#0b1220]">
                  {item.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={label(item)} className="max-h-full max-w-full object-contain" />
                  ) : item.kind === "video" ? (
                    <video src={item.url} controls preload="metadata" className="max-h-full max-w-full" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => void new Audio(item.url).play().catch(() => {})}
                      className="flex flex-col items-center gap-1 text-white/85 hover:text-white"
                      aria-label={`${t("libPlay")} ${label(item)}`}
                    >
                      <Icon name="play" className="h-10 w-10" />
                      <span className="text-xs font-semibold">{t("libPlay")}</span>
                    </button>
                  )}
                </div>
                <p className="text-sm font-bold text-brand-900">{label(item)}</p>

                {item.kind === "video" ? (
                  <p className="text-xs text-brand-900/60">{t("libVideoTierOnly")}</p>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-brand-900/85">{t("libRandom")}</span>
                      <span className="block text-xs text-brand-900/55">{t("libRandomHint")}</span>
                    </span>
                    <Switch
                      checked={item.inRandom}
                      onChange={(next) => void setRandom(item, next)}
                      label={`${t("libRandom")} ${label(item)}`}
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1.5">
                  {tierMins.length > 0 ? (
                    tierMins.map((min) => (
                      <span key={min} className="rounded-full bg-tip-100 px-2 py-0.5 text-xs font-semibold text-tip-700">
                        {t("libUsedIn", { amount: min.toLocaleString() })}
                      </span>
                    ))
                  ) : !item.inRandom || item.kind === "video" ? (
                    <span className="text-xs text-brand-900/50">{t("libUnused")}</span>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => setRemoving(item)}
                  className="mt-auto self-start text-xs font-semibold text-red-600 hover:underline"
                >
                  {t("libRemove")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-brand-900/55">
        {t("libTierHint")} ·{" "}
        <Link href={`/${locale}/dashboard/features/alerts`} className="font-semibold text-brand-700 hover:underline">
          {t("libTierLink")}
        </Link>
      </p>

      <ConfirmDialog
        open={removing !== null}
        message={removing && usedIn(removing.url).length > 0 ? t("libRemoveUsed") : t("libRemoveConfirm")}
        confirmLabel={t("libRemove")}
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
