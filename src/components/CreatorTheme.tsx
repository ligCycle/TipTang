import { creatorThemeCss } from "@/lib/creator-theme";

/**
 * Repaints the brand colours with a creator's channel colour while this
 * component is mounted (their donate page or their dashboard). A plain
 * <style> — no href/precedence — so React leaves it in place and removes it
 * when the visitor navigates back to the pink "lobby" pages.
 */
export function CreatorTheme({ color }: { color: string | null | undefined }) {
  const css = creatorThemeCss(color);
  if (!css) return null;
  return <style>{css}</style>;
}
