"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import {
  UPDATES_SEEN_KEY,
  hasUnseenUpdate,
  latestUpdateId,
} from "@/lib/updates";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("tiptang:updates-seen", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("tiptang:updates-seen", onChange);
  };
}

function readSeen(): string | null {
  try {
    return localStorage.getItem(UPDATES_SEEN_KEY);
  } catch {
    return null;
  }
}

/**
 * "What's new" button for the dashboard, with a dot while the newest update
 * hasn't been opened in this browser. The server snapshot says "seen", so the
 * server HTML never has a dot and hydration never disagrees; the dot appears
 * right after hydration when the stored id is older.
 */
export function UpdatesPill({
  href,
  label,
  newLabel,
  className,
}: {
  href: string;
  label: string;
  newLabel: string;
  className: string;
}) {
  const seen = useSyncExternalStore(subscribe, readSeen, latestUpdateId);
  const unseen = hasUnseenUpdate(seen);
  return (
    <Link href={href} className={`${className} relative`}>
      <Icon name="sparkles" />
      {label}
      {unseen && (
        <>
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[var(--background)]"
          />
          <span className="sr-only">{newLabel}</span>
        </>
      )}
    </Link>
  );
}
