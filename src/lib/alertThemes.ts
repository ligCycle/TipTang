// Look of the OBS donation-alert card. "light" = the original gradient card;
// "dark" = a dark glass card that glows in the creator's alert colour.
// Shared by the overlay (apply), the settings picker and the API (validate).
export const ALERT_THEMES = ["light", "dark"] as const;

export type AlertTheme = (typeof ALERT_THEMES)[number];

export const DEFAULT_ALERT_THEME: AlertTheme = "light";

export function isAlertTheme(v: unknown): v is AlertTheme {
  return typeof v === "string" && (ALERT_THEMES as readonly string[]).includes(v);
}
