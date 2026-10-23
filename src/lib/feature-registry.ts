import type { IconName } from "@/components/Icon";
import type { FeatureFlags } from "@/lib/feature-presets";

/**
 * Every feature card on the hub. A new feature = one entry here, one
 * settings page under /dashboard/features/<id>, and one overlay widget.
 * Message keys: featureHub.f_<id> (name) and featureHub.d_<id> (one line).
 */
export type FeatureId = "alerts" | "goal" | "subathon" | "soundpick" | "wheel" | "combo";

export type FeatureDef = {
  id: FeatureId;
  icon: IconName;
  flag: keyof FeatureFlags;
  /** Path under /{locale}. */
  href: string;
  /** Adds something to the fan donation page (orange tag on the card). */
  fanPage: boolean;
  /** The /api/overlay/asset kind that switches it. */
  toggleKind: "alertsToggle" | "goalToggle" | "timerToggle" | "soundPickToggle" | "wheelToggle" | "comboToggle";
  /**
   * Its own OBS browser-source link, after /overlay/<username>. Each feature
   * is a separate source so creators place and size it freely in OBS.
   * Null = no link of its own (e.g. sound pick plays through the alerts).
   */
  obsPath: "" | "/goal" | "/timer" | "/wheel" | "/combo" | null;
  /** Suggested browser-source size (width×height). */
  obsSize: string;
};

export const FEATURES: FeatureDef[] = [
  { id: "alerts", icon: "bell", flag: "alertsEnabled", href: "/dashboard/features/alerts", fanPage: false, toggleKind: "alertsToggle", obsPath: "", obsSize: "800×300" },
  { id: "goal", icon: "target", flag: "goalOverlayEnabled", href: "/dashboard/features/goal", fanPage: false, toggleKind: "goalToggle", obsPath: "/goal", obsSize: "700×300" },
  { id: "subathon", icon: "clock", flag: "timerEnabled", href: "/dashboard/features/subathon", fanPage: false, toggleKind: "timerToggle", obsPath: "/timer", obsSize: "400×260" },
  { id: "soundpick", icon: "volume", flag: "soundPickEnabled", href: "/dashboard/library", fanPage: true, toggleKind: "soundPickToggle", obsPath: null, obsSize: "" },
  { id: "wheel", icon: "wheel", flag: "wheelEnabled", href: "/dashboard/features/wheel", fanPage: true, toggleKind: "wheelToggle", obsPath: "/wheel", obsSize: "600×600" },
  { id: "combo", icon: "zap", flag: "comboEnabled", href: "/dashboard/features/combo", fanPage: false, toggleKind: "comboToggle", obsPath: "/combo", obsSize: "600×220" },
];
