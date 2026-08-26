"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

const KEY = "demoBannerDismissed";

export function DemoBanner({ text }: { text: string }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") setDismissed(true);
    } catch {
      // ignore
    }
  }, []);

  if (dismissed) return null;

  return (
    <div className="relative flex items-center justify-center gap-2 bg-amber-400 px-9 py-1.5 text-center text-xs font-semibold text-amber-950 sm:text-sm">
      <Icon name="alert-triangle" />
      <span>{text}</span>
      <button
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            // ignore
          }
        }}
        aria-label="Dismiss"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-amber-950/70 hover:bg-amber-500 hover:text-amber-950"
      >
        <Icon name="x" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
