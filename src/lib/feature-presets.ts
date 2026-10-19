/**
 * First-visit presets. A preset only switches features ON; it never turns
 * anything off and never touches a feature's other settings.
 */
export type FeatureFlags = {
  alertsEnabled: boolean;
  goalOverlayEnabled: boolean;
  timerEnabled: boolean;
  /** Sound pick on the donate page (not part of any preset). */
  soundPickEnabled: boolean;
  /** Spin wheel on the donate page (not part of any preset; needs the rules checklist). */
  wheelEnabled: boolean;
};

export const PRESETS = {
  basic: ["alertsEnabled"],
  goal: ["alertsEnabled", "goalOverlayEnabled"],
  subathon: ["alertsEnabled", "goalOverlayEnabled", "timerEnabled"],
} as const satisfies Record<string, readonly (keyof FeatureFlags)[]>;

export type PresetId = keyof typeof PRESETS;

export function isPresetId(v: unknown): v is PresetId {
  return typeof v === "string" && Object.hasOwn(PRESETS, v);
}

export function presetChanges(current: Partial<FeatureFlags>, preset: PresetId): Partial<FeatureFlags> {
  const out: Partial<FeatureFlags> = {};
  for (const k of PRESETS[preset]) if (!current[k]) out[k] = true;
  return out;
}
