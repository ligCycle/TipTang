"use client";

import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { LogoutButton } from "./LogoutButton";

type NavLink = { href: string; label: string };

export function NavMenu({
  links,
  loggedIn,
  logoutLabel,
  loginLabel,
  registerLabel,
  menuLabel,
}: {
  links: NavLink[];
  loggedIn: boolean;
  logoutLabel: string;
  loginLabel: string;
  registerLabel: string;
  menuLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile menu whenever the route changes (link was followed).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape, and force-close once the viewport grows past the `sm`
  // breakpoint so the mobile dropdown never lingers over the desktop nav.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= 640) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      {/* Desktop: inline nav (unchanged from before) */}
      <div className="hidden items-center gap-2 sm:flex sm:gap-3">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
          >
            {l.label}
          </Link>
        ))}
        {loggedIn ? (
          <LogoutButton label={logoutLabel} />
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
            >
              {loginLabel}
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
            >
              {registerLabel}
            </Link>
          </>
        )}
      </div>

      {/* Mobile: hamburger + dropdown */}
      <div className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={menuLabel}
          aria-expanded={open}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-800 hover:bg-brand-100"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>

        {open && (
          <>
            {/* Real dimming layer that captures the tap to close — prevents the
                iOS Safari "click-through" to links/CTAs sitting underneath. */}
            <div
              aria-hidden="true"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[99] bg-black/20 backdrop-blur-sm sm:hidden"
            />
            {/* `.card` surface is already dark-theme-aware (globals.css override),
                so contrast is correct in both themes. z-[100] floats above the
                backdrop and the sticky header. */}
            <div className="card absolute right-0 top-full z-[100] mt-2 w-56 rounded-2xl p-2">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100"
                >
                  {l.label}
                </Link>
              ))}
              <div className="my-1 border-t border-brand-900/10" />
              {loggedIn ? (
                <LogoutButton label={logoutLabel} />
              ) : (
                <>
                  <Link
                    href="/login"
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-brand-800 hover:bg-brand-100"
                  >
                    {loginLabel}
                  </Link>
                  <Link
                    href="/register"
                    className="mt-1 block rounded-lg bg-brand-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    {registerLabel}
                  </Link>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
