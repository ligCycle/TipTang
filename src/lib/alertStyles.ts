// Alert entrance/exit animation styles (CSS classes .alert-<style> live in
// globals.css). Shared by the overlay (apply) and the dashboard (picker) so
// the list never drifts.
export const ALERT_STYLES = [
  "pop",
  "slide",
  "bounce",
  "fade",
  "zoom",
  "glow",
] as const;

export type AlertStyle = (typeof ALERT_STYLES)[number];

export const DEFAULT_ALERT_STYLE: AlertStyle = "pop";

export function isAlertStyle(v: unknown): v is AlertStyle {
  return (
    typeof v === "string" && (ALERT_STYLES as readonly string[]).includes(v)
  );
}
