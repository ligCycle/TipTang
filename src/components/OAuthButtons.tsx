import { getTranslations } from "next-intl/server";
import { OAuthButton } from "./OAuthButton";

/**
 * Server component: renders a social-login button for each configured provider
 * (only Google for now) plus an "or" divider. Renders nothing when no provider
 * is configured, so the button never appears without working credentials.
 */
export async function OAuthButtons() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
  if (!googleEnabled) return null;

  const t = await getTranslations("auth");
  return (
    <div className="mb-5 space-y-4">
      <OAuthButton provider="google" label={t("continueWithGoogle")} />
      <div className="flex items-center gap-3 text-xs font-medium text-brand-900/40">
        <span className="h-px flex-1 bg-brand-200" />
        {t("orDivider")}
        <span className="h-px flex-1 bg-brand-200" />
      </div>
    </div>
  );
}
