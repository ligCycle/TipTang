import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { OAuthButtons } from "@/components/OAuthButtons";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <div className="mx-auto max-w-md">
      <div className="card rounded-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-900">
          {t("loginTitle")}
        </h1>
        {/* Social login (only shows when a provider is configured). */}
        <OAuthButtons />
        <LoginForm />
        <p className="mt-5 text-center text-sm text-brand-900/70">
          {t("noAccount")}{" "}
          <Link
            href="/register"
            className="font-semibold text-brand-700 hover:underline"
          >
            {t("goRegister")}
          </Link>
        </p>
      </div>
    </div>
  );
}
