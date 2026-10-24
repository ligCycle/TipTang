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
  /** Combo tip (not part of any preset). */
  comboEnabled: boolean;
  /** Fan clip requests (not part of any preset). */
  mediaEnabled: boolean;
  /** Fan voice messages (not part of any preset). */
  voiceEnabled: boolean;
  /** Gacha pull on the donate page (not part of any preset; needs its own rules). */
  gachaEnabled: boolean;
  /** PK matches (not part of any preset). */
  pkEnabled: boolean;
  /** Boss raid (not part of any preset). */
  bossEnabled: boolean;
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

/** What a goal turned on with no name or amount starts with, so the bar never shows up empty. */
export const DEFAULT_GOAL_TITLE = "เป้าหมายของฉัน";
export const DEFAULT_GOAL_AMOUNT = 1000;

/**
 * Turning the goal card on (page, hub or preset): fill only what's missing —
 * an empty name, a missing or zero amount. Never touches what the creator set.
 */
export function goalDefaults(cur: { goalTitle: string | null; goalAmount: unknown }): {
  goalTitle?: string;
  goalAmount?: number;
} {
  const out: { goalTitle?: string; goalAmount?: number } = {};
  if (!cur.goalTitle?.trim()) out.goalTitle = DEFAULT_GOAL_TITLE;
  const amount = Number(cur.goalAmount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) out.goalAmount = DEFAULT_GOAL_AMOUNT;
  return out;
}
