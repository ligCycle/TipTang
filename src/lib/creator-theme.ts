/**
 * A creator's channel colour (profileColor) paints their own "room" — their
 * donate page and their signed-in dashboard. This turns one colour into a
 * full brand ramp (50–900, light + dark) with readability guarantees, and the
 * CSS that swaps it in. Pure, so it is unit-tested.
 */

export const DEFAULT_PROFILE_COLOR = "#ec4899";
const WHITE = "#ffffff";
const BLACK = "#000000";
/** Dark-mode page background (globals.css). */
const DARK_BG = "#140b11";
/** Hue of the tip accent #ff8a3d, in degrees. */
const TIP_HUE = 24;

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type Step = (typeof STEPS)[number];
export type Ramp = Record<Step, string>;

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;

/** "#abc" / "#aabbcc" (any case, surrounding spaces) → "#aabbcc"; anything else → null. */
export function parseHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (HEX6.test(s)) return s.toLowerCase();
  if (HEX3.test(s)) {
    const [r, g, b] = s.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: Rgb): string {
  return (
    "#" +
    rgb
      .map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Blend a toward b by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const A = toRgb(a);
  const B = toRgb(b);
  return toHex([
    A[0] + (B[0] - A[0]) * t,
    A[1] + (B[1] - A[1]) * t,
    A[2] + (B[2] - A[2]) * t,
  ]);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1–21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Step c toward `toward` until it reaches `min` contrast against `against`. */
function pushUntil(c: string, toward: string, against: string, min: number): string {
  let x = c;
  for (let i = 0; i < 40 && contrast(x, against) < min; i++) x = mix(x, toward, 0.08);
  return x;
}

function hueSat(hex: string): { h: number; s: number } {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s };
}

/** Saturated colours within 30° of the tip orange would blur buttons and amounts. */
export function clashesWithTip(hex: string): boolean {
  const { h, s } = hueSat(hex);
  const dist = Math.min(Math.abs(h - TIP_HUE), 360 - Math.abs(h - TIP_HUE));
  return s > 0.35 && dist < 30;
}

export function creatorRamp(accent: string): { light: Ramp; dark: Ramp } {
  const a = accent;
  const light: Ramp = {
    50: mix(a, WHITE, 0.93),
    100: mix(a, WHITE, 0.86),
    200: mix(a, WHITE, 0.74),
    300: mix(a, WHITE, 0.55),
    400: mix(a, WHITE, 0.25),
    500: a,
    // Primary button background: its white label must stay readable.
    600: pushUntil(mix(a, BLACK, 0.1), BLACK, WHITE, 4.5),
    // Links and accents on light surfaces.
    700: pushUntil(mix(a, BLACK, 0.25), BLACK, WHITE, 4.5),
    800: mix(a, BLACK, 0.4),
    // Headings.
    900: pushUntil(mix(a, BLACK, 0.6), BLACK, WHITE, 7),
  };
  const dark: Ramp = {
    50: mix(a, DARK_BG, 0.92),
    100: mix(a, DARK_BG, 0.85),
    200: mix(a, DARK_BG, 0.75),
    300: mix(a, DARK_BG, 0.6),
    400: mix(a, DARK_BG, 0.1),
    500: a,
    // Links and headings on the dark page (same role as today's dark pink 600/700).
    600: pushUntil(mix(a, WHITE, 0.1), WHITE, DARK_BG, 4.5),
    700: pushUntil(mix(a, WHITE, 0.3), WHITE, DARK_BG, 4.5),
    800: mix(a, WHITE, 0.55),
    900: mix(a, WHITE, 0.8),
  };
  return { light, dark };
}

function vars(r: Ramp): string {
  return STEPS.map((s) => `--color-brand-${s}:${r[s]};`).join("");
}

/**
 * CSS that swaps the brand ramp (and the page's tinted background) for the
 * creator's colour. `:root[data-theme="dark"]` outranks globals.css's
 * `[data-theme="dark"]`. Null = keep TipTang pink (no colour, the default
 * pink, or anything that isn't a hex colour — raw input never reaches CSS).
 */
export function creatorThemeCss(color: unknown): string | null {
  const hex = parseHex(color);
  if (!hex || hex === DEFAULT_PROFILE_COLOR) return null;
  const { light, dark } = creatorRamp(hex);
  const clash = clashesWithTip(hex);
  return (
    `:root{${vars(light)}${clash ? `--color-tip-600:${light[900]};` : ""}}` +
    `:root[data-theme="dark"]{${vars(dark)}${clash ? `--color-tip-600:${dark[900]};` : ""}}` +
    `:root body{background:radial-gradient(1100px 500px at 100% -10%,${light[100]} 0%,transparent 55%),radial-gradient(900px 500px at -10% 0%,#fff4e6 0%,transparent 50%),var(--background);}` +
    `:root[data-theme="dark"] body{background:radial-gradient(1100px 500px at 100% -10%,${dark[200]} 0%,transparent 55%),radial-gradient(900px 500px at -10% 0%,${dark[100]} 0%,transparent 50%),var(--background);}`
  );
}
