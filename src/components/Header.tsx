import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { LogoutButton } from "./LogoutButton";
import { ThemeToggle } from "./ThemeToggle";

export async function Header() {
  const t = await getTranslations("common");
  const tAdmin = await getTranslations("admin");
  const session = await auth();
  const admin = isAdminEmail(session?.user?.email);

  return (
    <header className="sticky top-0 z-20 border-b border-brand-900/10 bg-brand-50/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-extrabold text-brand-700">
          <svg
            viewBox="0 0 64 64"
            className="h-7 w-7"
            aria-hidden="true"
            role="img"
          >
            <defs>
              <linearGradient id="ttHeader" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fb6aa0" />
                <stop offset="1" stopColor="#d92668" />
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="16" fill="url(#ttHeader)" />
            <circle cx="32" cy="34" r="16.5" fill="#ffffff" />
            <path
              d="M32 42.5c-7.3-4.8-9.9-8.5-6.6-11.9 2-2 4.6-1.2 6.6 1.2 2-2.4 4.6-3.2 6.6-1.2 3.3 3.4.7 7.1-6.6 11.9z"
              fill="#d92668"
            />
            <path
              d="M46 12l1.7 3.8 3.8 1.7-3.8 1.7L46 23l-1.7-3.8L40.5 17.5l3.8-1.7z"
              fill="#ffffff"
              opacity="0.95"
            />
          </svg>
          <span className="text-lg tracking-tight">{t("appName")}</span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <LocaleSwitcher />
          {session?.user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
              >
                {t("dashboard")}
              </Link>
              <Link
                href="/dashboard/settings"
                className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
              >
                {t("settings")}
              </Link>
              {admin && (
                <Link
                  href="/admin"
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
                >
                  {tAdmin("navLink")}
                </Link>
              )}
              <LogoutButton label={t("logout")} />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
              >
                {t("login")}
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                {t("register")}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
