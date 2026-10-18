/**
 * Where each on-screen feature sits on the single OBS link (a 1920x1080
 * stage). The old per-feature links ignore positions.
 */
export const ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

export type Anchor = (typeof ANCHORS)[number];
export type OnScreenFeature = "alert" | "goal" | "timer";

export const DEFAULT_POSITIONS: Record<OnScreenFeature, Anchor> = {
  alert: "center",
  goal: "bottom-center",
  timer: "top-right",
};

export function isAnchor(v: unknown): v is Anchor {
  return typeof v === "string" && (ANCHORS as readonly string[]).includes(v);
}

const CLASSES: Record<Anchor, string> = {
  "top-left": "top-8 left-8",
  "top-center": "top-8 left-1/2 -translate-x-1/2",
  "top-right": "top-8 right-8",
  "middle-left": "top-1/2 left-8 -translate-y-1/2",
  center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  "middle-right": "top-1/2 right-8 -translate-y-1/2",
  "bottom-left": "bottom-8 left-8",
  "bottom-center": "bottom-8 left-1/2 -translate-x-1/2",
  "bottom-right": "bottom-8 right-8",
};

/** Tailwind classes for an absolutely positioned box on the stage. */
export function anchorClasses(a: Anchor): string {
  return CLASSES[a];
}

/** Groups of 2+ enabled features placed on the same anchor. */
export function sharedAnchors(
  positions: Partial<Record<OnScreenFeature, Anchor>>,
  enabled: Partial<Record<OnScreenFeature, boolean>>,
): OnScreenFeature[][] {
  const byAnchor = new Map<Anchor, OnScreenFeature[]>();
  for (const f of ["alert", "goal", "timer"] as const) {
    const a = positions[f];
    if (!a || !enabled[f]) continue;
    byAnchor.set(a, [...(byAnchor.get(a) ?? []), f]);
  }
  return [...byAnchor.values()].filter((g) => g.length > 1);
}
