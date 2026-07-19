"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { Link, useRouter } from "@/i18n/navigation";

export default function RegisterPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Username auto-sanitizes to the allowed format (lowercase, a-z 0-9 _).
  const updateUsername = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({
      ...f,
      username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
    }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const map: Record<string, string> = {
          email_taken: t("errorEmailTaken"),
          username_taken: t("errorUsernameTaken"),
        };
        setError(map[data.error] ?? t("errorGeneric"));
        return;
      }
      // Auto sign-in after successful registration.
      const result = await signIn("credentials", {
        redirect: false,
        email: form.email,
        password: form.password,
      });
      if (result?.error) {
        setError(t("errorGeneric"));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card rounded-3xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-brand-900">
          {t("registerTitle")}
        </h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label={t("displayName")}>
            <input
              required
              value={form.displayName}
              onChange={update("displayName")}
              className="input"
            />
          </Field>
          <Field label={t("username")} hint={t("usernameHint")}>
            <input
              required
              value={form.username}
              onChange={updateUsername}
              name="username"
              autoComplete="username"
              minLength={3}
              maxLength={30}
              className="input"
              placeholder="yourname"
            />
          </Field>
          <Field label={t("email")}>
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              value={form.email}
              onChange={update("email")}
              className="input"
            />
          </Field>
          <Field label={t("password")} hint={t("passwordHint")}>
            <input
              required
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              onChange={update("password")}
              className="input"
            />
          </Field>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? t("submitRegister") + "…" : t("submitRegister")}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-brand-900/70">
          {t("haveAccount")}{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            {t("goLogin")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-brand-900/80">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-brand-900/50">{hint}</span>}
    </label>
  );
}
