import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ConnectedAccounts } from "@/components/ConnectedAccounts";
import { AccountSecurity } from "@/components/AccountSecurity";
import { Icon } from "@/components/Icon";

/** Account settings: connected sign-ins, email, password, sessions, delete. */
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionUser = await requireUser();
  if (!sessionUser) redirect(`/${locale}/login`);

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      email: true,
      googleId: true,
      emailVerifiedAt: true,
      passwordHash: true,
      username: true,
    },
  });
  if (!user) return null;

  const t = await getTranslations("settings");
  const tNav = await getTranslations("dashNav");
  const googleAuthEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-extrabold text-brand-900">{tNav("account")}</h1>
      {googleAuthEnabled && (
        <section>
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
            <Icon name="link" className="h-4 w-4" />
            {t("sectionAccount")}
          </h2>
          <p className="mt-1 text-sm text-brand-900/60">{t("connectedAccountsHint")}</p>
          <div className="mt-4">
            <ConnectedAccounts
              googleConnected={Boolean(user.googleId)}
              accountEmail={user.email}
              googleAuthEnabled={googleAuthEnabled}
              emailVerified={Boolean(user.emailVerifiedAt)}
            />
          </div>
        </section>
      )}
      <AccountSecurity
        email={user.email}
        emailVerified={Boolean(user.emailVerifiedAt)}
        // Only whether a password exists — the hash never leaves the server.
        hasPassword={Boolean(user.passwordHash)}
        username={user.username}
      />
    </div>
  );
}
