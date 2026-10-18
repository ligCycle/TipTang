import type { ReactNode } from "react";

const NUMERALS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"];

/**
 * One numbered, collapsible block on a feature settings page. Numbers run
 * from most to least important, so the first thing a creator needs is on top.
 */
export function SettingsSection({
  index,
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  index: number;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-brand-200 bg-brand-50/40"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2 font-bold text-brand-900">
          <span className="text-brand-600">{NUMERALS[index - 1] ?? index}</span>
          {title}
        </span>
        <span className="flex items-center gap-2 text-xs text-brand-900/55">
          {summary}
          <span className="transition-transform group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-brand-900/10 px-4 py-4">{children}</div>
    </details>
  );
}
