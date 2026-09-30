"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import { Icon } from "@/components/Icon";

/**
 * Account safety controls under the settings form: email verification
 * status, "sign out everywhere", and permanent account deletion. Lives
 * outside SettingsForm's <form> so none of these buttons can submit it.
 */
export function AccountSecurity({
  email,
  emailVerified,
  hasPassword,
  username,
}: {
  email: string;
  emailVerified: boolean;
  hasPassword: boolean;
  username: string;
}) {
  const t = useTranslations("settings");
  const locale = useLocale();

  const [verifyState, setVerifyState] = useState<
    "idle" | "sending" | "sent" | "error" | "limited"
  >("idle");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function resendVerify() {
    setVerifyState("sending");
    try {
      const res = await fetch("/api/verify-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      setVerifyState(res.ok ? "sent" : res.status === 429 ? "limited" : "error");
    } catch {
      setVerifyState("error");
    }
  }

  async function signOutEverywhere() {
    if (!window.confirm(t("signOutAllConfirm"))) return;
    setSigningOut(true);
    setSignOutError(false);
    try {
      const res = await fetch("/api/account/sign-out-everywhere", {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      await signOut({ callbackUrl: `/${locale}/login` });
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  }

  async function deleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: confirmName,
          ...(hasPassword ? { password } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const map: Record<string, string> = {
          username_mismatch: t("deleteErrorUsername"),
          wrong_password: t("deleteErrorPassword"),
          rate_limited: t("deleteErrorLimited"),
        };
        setDeleteError(map[data.error] ?? t("deleteErrorGeneric"));
        setDeleting(false);
        return;
      }
      await signOut({ callbackUrl: `/${locale}` });
    } catch {
      setDeleteError(t("deleteErrorGeneric"));
      setDeleting(false);
    }
  }

  const nameMatches = confirmName.trim().toLowerCase() === username;

  return (
    <div className="card mt-6 space-y-6 rounded-3xl p-6">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
        <Icon name="shield" />
        {t("sectionSecurity")}
      </h2>

      {/* Email ownership */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium text-brand-900">
            <Icon name="mail" className="h-4 w-4 shrink-0" />
            <span className="truncate">{email}</span>
          </p>
          <p className="mt-0.5 text-sm text-brand-900/60">
            {emailVerified ? t("emailVerified") : t("emailNotVerified")}
          </p>
        </div>
        {emailVerified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
            <Icon name="check" className="h-3.5 w-3.5" />
            {t("emailVerifiedBadge")}
          </span>
        ) : (
          <button
            type="button"
            onClick={resendVerify}
            disabled={verifyState === "sending" || verifyState === "sent"}
            className="btn-secondary px-4 py-2 text-sm"
          >
            {verifyState === "sent" ? t("verifySent") : t("verifyResend")}
          </button>
        )}
      </div>
      {verifyState === "error" && (
        <p className="-mt-4 text-sm text-red-600 dark:text-red-400">{t("verifyError")}</p>
      )}
      {verifyState === "limited" && (
        <p className="-mt-4 text-sm text-red-600 dark:text-red-400">{t("verifyLimited")}</p>
      )}

      {/* Sign out everywhere */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-900/10 pt-6">
        <div>
          <p className="font-medium text-brand-900">{t("signOutAllTitle")}</p>
          <p className="mt-0.5 text-sm text-brand-900/60">{t("signOutAllHint")}</p>
        </div>
        <button
          type="button"
          onClick={signOutEverywhere}
          disabled={signingOut}
          className="btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
        >
          <Icon name="log-out" className="h-4 w-4" />
          {t("signOutAllButton")}
        </button>
      </div>
      {signOutError && (
        <p className="-mt-4 text-sm text-red-600 dark:text-red-400">{t("deleteErrorGeneric")}</p>
      )}

      {/* Delete account */}
      <div className="border-t border-brand-900/10 pt-6">
        <p className="font-medium text-red-700 dark:text-red-400">{t("deleteTitle")}</p>
        <p className="mt-0.5 text-sm text-brand-900/60">{t("deleteHint")}</p>
        {!deleteOpen ? (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:border-red-400/60 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            <Icon name="trash" className="h-4 w-4" />
            {t("deleteOpen")}
          </button>
        ) : (
          <form onSubmit={deleteAccount} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-900/80">
                {t("deleteTypeUsername", { username })}
              </span>
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                autoComplete="off"
                className="input"
              />
            </label>
            {hasPassword && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-brand-900/80">
                  {t("deletePassword")}
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="input"
                />
              </label>
            )}
            {deleteError && (
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{deleteError}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={!nameMatches || (hasPassword && !password) || deleting}
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                <Icon name="trash" className="h-4 w-4" />
                {t("deleteConfirm")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
                  setConfirmName("");
                  setPassword("");
                  setDeleteError(null);
                }}
                className="btn-secondary px-4 py-2 text-sm"
              >
                {t("deleteCancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
