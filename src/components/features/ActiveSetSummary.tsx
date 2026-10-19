"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import type { OverlayConfig } from "@/components/OverlaySettings";
import { SetSwitcher } from "@/components/features/SetSwitcher";
import { useSoundSets } from "@/components/features/useSoundSets";

/**
 * Section ③ on the alerts page: what normal alerts play (the active set's
 * images, sounds and videos), the set switcher, and a link to the library.
 */
export function ActiveSetSummary({ config }: { config: OverlayConfig }) {
  const t = useTranslations("featureHub");
  const { active } = useSoundSets();
  const ids = new Set(active?.items.map((i) => i.assetId) ?? []);
  const images = config.libraryStickers.filter((f) => ids.has(f.id));
  const sounds = config.librarySounds.filter((f) => ids.has(f.id));
  const videos = config.libraryVideos.filter((f) => ids.has(f.id));

  const row = (icon: "image" | "volume" | "video", label: string, count: number) => (
    <li className="flex items-center gap-2 text-sm text-brand-900/80">
      <Icon name={icon} className="h-4 w-4 shrink-0 text-brand-700" />
      <span className="flex-1">{label}</span>
      <span className="font-semibold">
        {count === 0 ? t("mediaNone") : count === 1 ? t("mediaOne") : t("mediaRandom", { count })}
      </span>
    </li>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-900/65">{t("mediaIntro")}</p>
      <SetSwitcher showManage />
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.slice(0, 6).map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={img.id} src={img.url} alt="" className="h-12 w-12 rounded-lg bg-[#0b1220] object-contain" />
          ))}
        </div>
      )}
      <ul className="space-y-1.5 rounded-xl bg-brand-50 p-3">
        {row("image", t("mediaImages"), images.length)}
        {row("volume", t("mediaSounds"), sounds.length)}
        {row("video", t("mediaVideos"), videos.length)}
      </ul>
      {videos.length > 0 && <p className="text-xs text-brand-900/60">{t("mediaVideoNote")}</p>}
      {images.length + sounds.length + videos.length === 0 && (
        <p className="text-xs text-brand-900/60">{t("mediaEmpty")}</p>
      )}
    </div>
  );
}
