import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { OAuthButtons } from "@/components/OAuthButtons";
import { RegisterForm } from "@/components/RegisterForm";

export default async function RegisterPage({
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
          {t("registerTitle")}
        </h1>
        {/* Social sign-up (only shows when a provider is configured). */}
        <OAuthButtons />
        <RegisterForm />
        <p className="mt-5 text-center text-sm text-brand-900/70">
          {t("haveAccount")}{" "}
          <Link
            href="/login"
            className="font-semibold text-brand-700 hover:underline"
          >
            {t("goLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}
