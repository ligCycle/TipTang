"use client";

import { useEffect } from "react";
import { UPDATES_SEEN_KEY, latestUpdateId } from "@/lib/updates";

/** Opening the updates page counts as having seen everything on it. */
export function MarkUpdatesSeen() {
  useEffect(() => {
    try {
      localStorage.setItem(UPDATES_SEEN_KEY, latestUpdateId());
      // `storage` only fires in OTHER tabs; tell this tab's listeners too.
      window.dispatchEvent(new Event("tiptang:updates-seen"));
    } catch {
      // Private mode / blocked storage — the dot just stays, no harm.
    }
  }, []);
  return null;
}
