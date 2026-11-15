/**
 * Channel-owner badge rules (docs/superpowers/specs/2026-11-15-channel-verify-badge-design.md).
 * A creator asks for one of their saved channel links; the founder checks the
 * channel by hand. The badge means "this TipTang account controls that
 * channel" and lasts only while the saved link is exactly the one checked.
 * Pure, no "server-only" import — so it runs under `node --test`.
 */
import { SOCIAL_PLATFORMS, type SocialKey, type SocialLinks } from "./socials.ts";

export type ChannelVerifyStatus = "PENDING" | "VERIFIED" | "REJECTED";

/** Platforms with a channel owner (not Discord, not a personal website). */
export const VERIFIABLE_KEYS = ["youtube", "twitch", "tiktok", "facebook", "kick", "instagram", "x"] as const satisfies readonly SocialKey[];

export type VerifiableLink = { key: SocialKey; url: string; label: string };

function labelOf(key: SocialKey): string {
  return SOCIAL_PLATFORMS.find((p) => p.key === key)?.label ?? key;
}

function isVerifiable(key: string | null): key is (typeof VERIFIABLE_KEYS)[number] {
  return (VERIFIABLE_KEYS as readonly string[]).includes(key ?? "");
}

/** The creator's saved links that can be put up for checking, in VERIFIABLE_KEYS order. */
export function verifiableLinks(socials: SocialLinks): VerifiableLink[] {
  return VERIFIABLE_KEYS.flatMap((key) => {
    const url = socials[key];
    return url ? [{ key, url, label: labelOf(key) }] : [];
  });
}

/** True while the saved link for `key` is exactly the URL that was asked for. */
export function requestStillValid(key: string | null, url: string | null, socials: SocialLinks): boolean {
  return isVerifiable(key) && url !== null && socials[key] === url;
}

/** What the donate page shows after the name, or null for no badge. */
export function badgeFor(
  u: { channelVerifyStatus: ChannelVerifyStatus | null; channelVerifyKey: string | null; channelVerifyUrl: string | null },
  socials: SocialLinks,
): VerifiableLink | null {
  if (u.channelVerifyStatus !== "VERIFIED") return null;
  if (!requestStillValid(u.channelVerifyKey, u.channelVerifyUrl, socials)) return null;
  const key = u.channelVerifyKey as SocialKey;
  return { key, url: u.channelVerifyUrl as string, label: labelOf(key) };
}

/** Prisma update that forgets any request or badge. */
export const CLEARED_VERIFY = {
  channelVerifyStatus: null,
  channelVerifyKey: null,
  channelVerifyUrl: null,
  channelVerifyRequestedAt: null,
  channelVerifiedAt: null,
} as const;
