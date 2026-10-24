/**
 * Two OBS links (spec docs/superpowers/specs/2026-10-24-obs-two-links-design.md):
 * the main link plays every popup, the bars link stacks the bars. Pure rules
 * for which clients each one mounts.
 */
import { LIVE_MS } from "./combo.ts";

export type MainCard = "alerts" | "media" | "wheel" | "gacha" | "boss";
export type BarCard = "goal" | "timer" | "combo" | "pk" | "boss";
export type StageLink = "main" | "bars";

export type CardFlags = {
  alerts: boolean;
  media: boolean;
  voice: boolean;
  wheel: boolean;
  gacha: boolean;
  boss: boolean;
  goal: boolean;
  timer: boolean;
  combo: boolean;
  pk: boolean;
};
/** Features that can also run on a link of their own. */
export type OwnLinks = { wheel: boolean; gacha: boolean; media: boolean; boss: boolean };

/** A per-feature link counts as in use while it was polled within LIVE_MS. */
export function ownLinkLive(seenAt: Date | null, now: Date): boolean {
  return Boolean(seenAt && seenAt.getTime() >= now.getTime() - LIVE_MS);
}

/**
 * Which clients a link mounts. Main: popup cards that are on (or have a test
 * waiting), minus any whose own link is live — that link keeps playing them,
 * so nothing plays twice (C4). Bars: every bar; they hide themselves (C10).
 */
export function stageCards(flags: CardFlags, own: OwnLinks, tests: OwnLinks, link: "main"): Record<MainCard, boolean>;
export function stageCards(flags: CardFlags, own: OwnLinks, tests: OwnLinks, link: "bars"): Record<BarCard, boolean>;
export function stageCards(
  flags: CardFlags,
  own: OwnLinks,
  tests: OwnLinks,
  link: StageLink,
): Record<MainCard, boolean> | Record<BarCard, boolean> {
  if (link === "bars") return { goal: true, timer: true, combo: true, pk: true, boss: true };
  const on = (k: keyof OwnLinks, flag: boolean) => (flag || tests[k]) && !own[k];
  return {
    alerts: true,
    media: on("media", flags.media || flags.voice),
    wheel: on("wheel", flags.wheel),
    gacha: on("gacha", flags.gacha),
    boss: on("boss", flags.boss),
  };
}

/** Bars whose own per-feature link is open (polled within LIVE_MS). */
export type BarOwnLinks = Record<BarCard, boolean>;

/**
 * Which bars the bars link mounts: every bar, minus any whose own link is
 * open — that link shows it, so a creator can place one bar apart and keep
 * the rest stacked, and nothing shows twice. Idle bars hide themselves.
 */
export function barCards(own: BarOwnLinks): Record<BarCard, boolean> {
  return { goal: !own.goal, timer: !own.timer, combo: !own.combo, pk: !own.pk, boss: !own.boss };
}
