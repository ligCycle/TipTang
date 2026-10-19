"use client";

import { useTranslations } from "next-intl";
import { SOCIAL_PLATFORMS, type SocialLinks } from "@/lib/socials";
import { SocialIcon } from "@/components/SocialIcon";

const SAMPLE_AMOUNTS = [20, 50, 100];

/**
 * A small, live picture of the creator's donate page as they edit settings:
 * cover, avatar, name, bio, socials and the tip button in their colour, plus
 * the thank-you message fans see after tipping. Unsaved edits show here too.
 */
export function DonatePreview({
  displayName,
  username,
  bio,
  avatarUrl,
  coverUrl,
  color,
  socialLinks,
  thankYouMessage,
  minTipAmount,
}: {
  displayName: string;
  username: string;
  bio: string;
  avatarUrl: string;
  coverUrl: string;
  color: string;
  socialLinks: SocialLinks;
  thankYouMessage: string;
  minTipAmount: number;
}) {
  const t = useTranslations("settings");
  const accent = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#ec4899";
  const gradient = `linear-gradient(135deg, ${accent}, color-mix(in srgb, ${accent}, black 25%))`;
  const socials = SOCIAL_PLATFORMS.filter((p) => socialLinks[p.key]?.trim());
  const amounts = SAMPLE_AMOUNTS.map((a) => Math.max(a, minTipAmount));
  const name = displayName.trim() || t("previewNameFallback");

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold text-brand-900">{t("previewTitle")}</p>
      <div className="overflow-hidden rounded-2xl border border-brand-200 bg-white text-left shadow-sm dark:bg-[#1a1016]">
        <div className="h-20 w-full overflow-hidden" style={{ backgroundImage: gradient }}>
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="px-4 pb-4">
          <div
            className="-mt-8 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-4 border-white text-2xl font-black text-white shadow"
            style={{ backgroundImage: gradient }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              name.charAt(0).toUpperCase()
            )}
          </div>
          <p className="mt-2 truncate text-lg font-extrabold text-brand-900">{name}</p>
          <p className="truncate text-xs font-medium" style={{ color: accent }}>
            @{username || "username"}
          </p>
          {socials.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {socials.map((p) => (
                <span
                  key={p.key}
                  title={p.label}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-black/5 bg-white shadow-sm"
                >
                  <SocialIcon platform={p.key} />
                </span>
              ))}
            </div>
          )}
          {bio.trim() && <p className="mt-2 line-clamp-3 text-xs text-brand-900/70">{bio}</p>}

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {amounts.map((a, i) => (
              <span
                key={i}
                className="rounded-lg border px-1 py-1.5 text-center text-xs font-bold"
                style={i === 1 ? { backgroundImage: gradient, color: "#fff", borderColor: "transparent" } : { borderColor: accent, color: accent }}
              >
                ฿{a.toLocaleString()}
              </span>
            ))}
          </div>
          <span
            className="mt-2 block rounded-full py-2 text-center text-sm font-bold text-white"
            style={{ backgroundImage: gradient }}
          >
            {t("previewTipButton")}
          </span>
        </div>
      </div>

      {thankYouMessage.trim() && (
        <div className="rounded-2xl border border-brand-200 p-3">
          <p className="text-xs font-semibold text-brand-900/55">{t("previewThanksTitle")}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-brand-900/85">{thankYouMessage}</p>
        </div>
      )}
      <p className="text-xs text-brand-900/50">{t("previewHint")}</p>
    </div>
  );
}
