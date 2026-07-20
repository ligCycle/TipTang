"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const pathname = usePathname();

  useEffect(() => {
    // Re-assert the theme on every mount (e.g. after a locale switch remounts
    // the tree and drops the data-theme attribute) — read from storage, falling
    // back to the current attribute, then the system preference.
    let resolved: "light" | "dark";
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("theme");
    } catch {
      // ignore
    }
    if (stored === "light" || stored === "dark") {
      resolved = stored;
    } else {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr === "light" || attr === "dark") {
        resolved = attr;
      } else {
        resolved = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
      }
    }
    document.documentElement.setAttribute("data-theme", resolved);
    setTheme(resolved);
    // Re-run on navigation (e.g. locale switch) so the theme never resets.
  }, [pathname]);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // ignore
    }
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="rounded-full border border-brand-900/15 bg-brand-50/60 px-2.5 py-1.5 text-sm hover:bg-brand-100"
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
