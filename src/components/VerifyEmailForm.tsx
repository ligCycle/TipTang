"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/*
 * One click to confirm, rather than confirming on page load: mail scanners
 * open links without running scripts, so the token is only spent by a person.
 */
function VerifyInner() {
  const t = useTranslations("auth");
  const token = useSearchParams().get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<"idle" | "success" | "error">("idle");

  async function confirm() {
    setLoading(true);
    setState("idle");
    try {
      const res = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
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
        <h1 className="mb-4 text-2xl font-bold text-brand-900">
          {t("verifyTitle")}
        </h1>
        {state === "success" ? (
          <>
            <p className="text-brand-900/80">{t("verifySuccess")}</p>
            <Link href="/dashboard" className="btn-primary mt-6 w-full">
              {t("verifyToDashboard")}
            </Link>
          </>
        ) : (
          <>
            <p className="text-brand-900/70">{t("verifyIntro")}</p>
            {state === "error" && (
              <p className="mt-4 text-sm font-medium text-red-600">
                {t("verifyInvalid")}
              </p>
            )}
            <button
              type="button"
              onClick={confirm}
              disabled={loading || !token}
              className="btn-primary mt-6 w-full"
            >
              {loading ? t("verifySubmit") + "…" : t("verifySubmit")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function VerifyEmailForm() {
  return (
    <Suspense>
      <VerifyInner />
    </Suspense>
  );
}
