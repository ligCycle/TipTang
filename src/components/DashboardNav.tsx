"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/Icon";
import { LogoutButton } from "@/components/LogoutButton";

type Item = { path: string; label: string; icon: IconName; exact?: boolean };

/**
 * The dashboard menu, grouped by where things show up. Every item has its own
 * route, so the active item is simply the current route. Desktop: a sticky
 * sidebar. Below md: one horizontally scrolling row, every item one tap away.
 * The guide and logout live here too (the header hides its links on the
 * dashboard).
 */
export function DashboardNav({ admin }: { admin: boolean }) {
  const t = useTranslations("dashNav");
  const locale = useLocale();
  const pathname = usePathname();
  const rowRef = useRef<HTMLDivElement>(null);

  // Mobile row: bring the current item into view (it may sit off to the right).
  useEffect(() => {
    rowRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  const groups: { title: string; items: Item[] }[] = [
    {
      title: t("groupOverview"),
      items: [
        { path: "/dashboard", label: t("home"), icon: "home", exact: true },
        { path: "/dashboard/tips", label: t("tips"), icon: "list" },
      ],
    },
    {
      title: t("groupFan"),
      items: [{ path: "/dashboard/settings", label: t("donatePage"), icon: "heart" }],
    },
    {
      title: t("groupStream"),
      items: [
        { path: "/dashboard/features", label: t("features"), icon: "sparkles" },
        { path: "/dashboard/library", label: t("library"), icon: "volume" },
      ],
    },
    {
      title: t("groupAccount"),
      items: [
        { path: "/dashboard/account", label: t("account"), icon: "user" },
        ...(admin ? [{ path: "/admin", label: t("admin"), icon: "shield" as IconName }] : []),
      ],
    },
  ];

  const isActive = (item: Item) => {
    const full = `/${locale}${item.path}`;
    return item.exact ? pathname === full : pathname === full || pathname.startsWith(`${full}/`);
  };

  const linkClass = (active: boolean) =>
    `flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
      active
        ? "bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200"
        : "text-brand-900/70 hover:bg-brand-100/60"
    }`;
  const logoutClass =
    "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-brand-900/70 transition hover:bg-brand-100/60 disabled:opacity-50";
  const guide = (
    <Link href={`/${locale}/start`} className={linkClass(false)}>
      <Icon name="book-open" className="h-4 w-4" />
      {t("guide")}
    </Link>
  );
  const logout = (
    <LogoutButton label={t("logout")} className={logoutClass} icon={<Icon name="log-out" className="h-4 w-4" />} />
  );


  return (
    <nav aria-label={t("menuLabel")} className="md:w-52 md:shrink-0">
      {/* Mobile: one scrolling row. */}
      <div ref={rowRef} className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {groups.flatMap((g) => g.items).map((item) => (
          <Link
            key={item.path}
            href={`/${locale}${item.path}`}
            aria-current={isActive(item) ? "page" : undefined}
            className={linkClass(isActive(item))}
          >
            <Icon name={item.icon} className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
        {guide}
        {logout}
      </div>
      {/* Desktop: grouped sidebar. */}
      <div className="sticky top-4 hidden space-y-4 md:block">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-brand-900/45">
              {g.title}
            </p>
            <div className="space-y-0.5">
              {g.items.map((item) => (
                <Link
                  key={item.path}
                  href={`/${locale}${item.path}`}
                  aria-current={isActive(item) ? "page" : undefined}
                  className={linkClass(isActive(item))}
                >
                  <Icon name={item.icon} className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
        <div className="space-y-0.5 border-t border-brand-900/10 pt-3">
          {guide}
          {logout}
        </div>
      </div>
    </nav>
  );
}
