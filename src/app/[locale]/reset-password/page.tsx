"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

function ResetInner() {
  const t = useTranslations("auth");
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<"idle" | "success" | "error">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setState("idle");
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      setState(res.ok ? "success" : "error");
    } catch {
      setState("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card rounded-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-900">
          {t("resetTitle")}
        </h1>

        {state === "success" ? (
          <>
            <p className="text-brand-900/80">{t("resetSuccess")}</p>
            <Link href="/login" className="btn-primary mt-6 w-full">
              {t("backToLogin")}
            </Link>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-900/80">
                {t("newPassword")}
              </span>
              <input
                required
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
              <span className="mt-1 block text-xs text-brand-900/50">
                {t("passwordHint")}
              </span>
            </label>

            {state === "error" && (
              <p className="text-sm font-medium text-red-600">
                {t("resetInvalid")}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !token}
              className="btn-primary w-full"
            >
              {loading ? t("forgotSending") : t("resetSubmit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetInner />
    </Suspense>
  );
}
