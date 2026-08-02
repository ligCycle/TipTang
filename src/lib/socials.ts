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

// Brand logos live in <SocialIcon> (keyed by `key`), not here.
export const SOCIAL_PLATFORMS: {
  key: SocialKey;
  label: string;
  placeholder: string;
}[] = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourname" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@yourname" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@yourname" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/yourpage" },
  { key: "x", label: "X (Twitter)", placeholder: "https://x.com/yourname" },
  { key: "discord", label: "Discord", placeholder: "https://discord.gg/invite" },
  { key: "website", label: "Website", placeholder: "https://yoursite.com" },
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
