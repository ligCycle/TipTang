import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { LogoutButton } from "./LogoutButton";

export async function Header() {
  const t = await getTranslations("common");
  const session = await auth();

  return (
    <header className="sticky top-0 z-20 border-b border-brand-900/10 bg-white/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-extrabold text-brand-700">
          <span className="text-xl">💸</span>
          <span className="text-lg tracking-tight">{t("appName")}</span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <LocaleSwitcher />
          {session?.user ? (
            <>
              <Link
                href="/dashboard"
                className="rounded-full px-3 py-1.5 text-sm font-medium text-brand-800 hover:bg-brand-100"
              >
                {t("dashboard")}
              </Link>
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
