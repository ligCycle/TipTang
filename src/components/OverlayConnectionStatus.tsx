"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { relativeTime } from "@/lib/format";
import { OVERLAY_STATUS_POLL_MS, parseLastSeen } from "@/lib/overlay-connection";

/**
 * Tells the creator whether their live program has really loaded the overlay
 * URL. The browser preview doesn't count (it runs in test mode), which is the
 * point: "the preview worked" used to be mistaken for "OBS is set up".
 * While nothing has connected yet it re-checks every few seconds and stops
 * once the first load arrives. Remount it (key) when the URL changes.
 */
export function OverlayConnectionStatus({
  initialLastSeenAt,
}: {
  initialLastSeenAt: string | null;
}) {
  const t = useTranslations("dashboard");
  const lang = useLocale() === "en" ? "en" : "th";
  const [lastSeen, setLastSeen] = useState<Date | null>(() =>
    parseLastSeen(initialLastSeenAt),
  );
  const connected = lastSeen !== null;

  useEffect(() => {
    if (connected) return;
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/overlay/status", { cache: "no-store" });
        if (!res.ok) return;
        const d = await res.json();
        const seen = parseLastSeen(d.lastSeenAt);
        if (seen) setLastSeen(seen);
      } catch {
        // offline for a moment — try again on the next tick
      }
    }, OVERLAY_STATUS_POLL_MS);
    return () => window.clearInterval(id);
  }, [connected]);

  return (
    <p
      role="status"
      className={`mt-2 inline-flex items-start gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold ${
        connected
          ? "bg-emerald-100 text-emerald-700"
          : "bg-amber-100 text-amber-800"
      }`}
    >
      <Icon
        name={connected ? "check-circle" : "clock"}
        className="mt-px h-3.5 w-3.5 shrink-0"
      />
      <span>
        {connected
          ? t("obsStatusConnected", { when: relativeTime(lastSeen, new Date(), lang) })
          : t("obsStatusWaiting")}
      </span>
    </p>
  );
}
