"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import type { OverlayConfig } from "@/components/OverlaySettings";

/**
 * Section ③ on the alerts page: which library files normal alerts use (the
 * ones switched on there), with a link to manage them. Files live only in
 * the library now.
 */
export function NormalMediaSummary({ config }: { config: OverlayConfig }) {
  const t = useTranslations("featureHub");
  const locale = useLocale();
  const on = <T extends { inRandom: boolean }>(list: T[]) => list.filter((x) => x.inRandom);
  const images = on(config.libraryStickers);
  const sounds = on(config.librarySounds);
  const videos = on(config.libraryVideos);
  const none = images.length + sounds.length + videos.length === 0;

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
      {none && <p className="text-xs text-brand-900/60">{t("mediaEmpty")}</p>}
      <Link
        href={`/${locale}/dashboard/library`}
        className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2 text-sm"
      >
        {t("mediaManage")}
        <Icon name="arrow-right" className="h-4 w-4" />
      </Link>
    </div>
  );
}
