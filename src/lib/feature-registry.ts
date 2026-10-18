import type { IconName } from "@/components/Icon";
import type { FeatureFlags } from "@/lib/feature-presets";

/**
 * Every feature card on the hub. A new feature = one entry here, one
 * settings page under /dashboard/features/<id>, and one overlay widget.
 * Message keys: featureHub.f_<id> (name) and featureHub.d_<id> (one line).
 */
export type FeatureId = "alerts" | "goal" | "subathon";

export type FeatureDef = {
  id: FeatureId;
  icon: IconName;
  flag: keyof FeatureFlags;
  /** Path under /{locale}. */
  href: string;
  /** Adds something to the fan donation page (orange tag on the card). */
  fanPage: boolean;
  /** The /api/overlay/asset kind that switches it. */
  toggleKind: "alertsToggle" | "goalToggle" | "timerToggle";
};

export const FEATURES: FeatureDef[] = [
  { id: "alerts", icon: "bell", flag: "alertsEnabled", href: "/dashboard/features/alerts", fanPage: false, toggleKind: "alertsToggle" },
  { id: "goal", icon: "target", flag: "goalOverlayEnabled", href: "/dashboard/features/goal", fanPage: false, toggleKind: "goalToggle" },
  { id: "subathon", icon: "clock", flag: "timerEnabled", href: "/dashboard/features/subathon", fanPage: false, toggleKind: "timerToggle" },
];
