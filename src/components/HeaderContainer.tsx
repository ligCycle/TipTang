"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";

/**
 * The header's inner row. On dashboard pages it widens on xl screens to match
 * the dashboard (which grows past the site's max-w-5xl), so the logo lines up
 * with the sidebar.
 */
export function HeaderContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const dashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  return (
    <div
      className={`mx-auto flex w-full items-center justify-between px-4 py-3 ${
        dashboard ? "max-w-5xl xl:max-w-[calc(min(80rem,_100vw_-_3rem)_+_2rem)]" : "max-w-5xl"
      }`}
    >
      {children}
    </div>
  );
}
