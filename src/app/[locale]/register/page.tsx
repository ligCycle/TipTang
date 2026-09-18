import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { OAuthButtons } from "@/components/OAuthButtons";
import { RegisterForm } from "@/components/RegisterForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("registerTitle") };
}

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
        <OAuthButtons intent="register" />
        <RegisterForm />
        {/* The terms say registering = acceptance; say so where it happens.
            Covers both the form above and the Google button. */}
        <p className="mt-4 text-center text-xs leading-relaxed text-brand-900/60">
          {t.rich("registerConsent", {
            terms: (chunks) => (
              <Link href="/terms" className="underline hover:text-brand-700">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/privacy" className="underline hover:text-brand-700">
                {chunks}
              </Link>
            ),
          })}
        </p>
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
