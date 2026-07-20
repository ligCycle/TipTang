// Shared metadata for the creator's social links. Used by both the settings
// form and the public profile so the set of platforms stays in one place.

export type SocialKey =
  | "instagram"
  | "youtube"
  | "tiktok"
  | "facebook"
  | "x"
  | "discord"
  | "website";

export type SocialLinks = Partial<Record<SocialKey, string>>;

export const SOCIAL_PLATFORMS: {
  key: SocialKey;
  label: string;
  icon: string;
  placeholder: string;
}[] = [
  { key: "instagram", label: "Instagram", icon: "📸", placeholder: "https://instagram.com/yourname" },
  { key: "youtube", label: "YouTube", icon: "▶️", placeholder: "https://youtube.com/@yourname" },
  { key: "tiktok", label: "TikTok", icon: "🎵", placeholder: "https://tiktok.com/@yourname" },
  { key: "facebook", label: "Facebook", icon: "👍", placeholder: "https://facebook.com/yourpage" },
  { key: "x", label: "X (Twitter)", icon: "𝕏", placeholder: "https://x.com/yourname" },
  { key: "discord", label: "Discord", icon: "💬", placeholder: "https://discord.gg/invite" },
  { key: "website", label: "Website", icon: "🌐", placeholder: "https://yoursite.com" },
];

const KEYS = new Set<string>(SOCIAL_PLATFORMS.map((p) => p.key));

// Coerce an unknown DB Json value into a clean, typed SocialLinks object,
// keeping only known platforms with non-empty http(s) URLs.
export function normalizeSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== "object") return {};
  const out: SocialLinks = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!KEYS.has(k)) continue;
    if (typeof v !== "string") continue;
    const url = v.trim();
    if (/^https?:\/\/.+/i.test(url)) out[k as SocialKey] = url;
  }
  return out;
}
