// Look of the OBS donation-alert card. "light" = the original gradient card;
// "dark" = a dark glass card that glows in the creator's alert colour.
// Shared by the overlay (apply), the settings picker and the API (validate).
import { contrast, mix } from "./creator-theme.ts";

export const ALERT_THEMES = ["light", "dark"] as const;

export type AlertTheme = (typeof ALERT_THEMES)[number];

export const DEFAULT_ALERT_THEME: AlertTheme = "light";

export function isAlertTheme(v: unknown): v is AlertTheme {
  return typeof v === "string" && (ALERT_THEMES as readonly string[]).includes(v);
}

/** Background of the dark alert card (OverlayClient, bg-[#120c16]). */
const DARK_CARD_BG = "#120c16";

// Glow colour for the dark card: the creator's alert colour, lifted toward
// white until it reaches 3:1 against the card, so a near-black pick still
// shows its border, glow and label.
export function darkCardGlow(color: string): string {
  let x = color;
  for (let i = 0; i < 40 && contrast(x, DARK_CARD_BG) < 3; i++) x = mix(x, "#ffffff", 0.08);
  return x;
}
