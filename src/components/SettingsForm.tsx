"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Initial = {
  displayName: string;
  username: string;
  bio: string;
  promptpayId: string;
};

export function SettingsForm({ initial }: { initial: Initial }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const update =
    (k: keyof Initial) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  // Username auto-sanitizes to the allowed format (lowercase, a-z 0-9 _).
  const updateUsername = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({
      ...f,
      username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
    }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error === "username_taken"
            ? t("errorUsernameTaken")
            : tc("loading"),
        );
        setStatus("error");
        return;
      }
      setStatus("saved");
      router.refresh();
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="card rounded-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-brand-900">{t("title")}</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-brand-900/80">
            {t("displayName")}
          </span>
          <input
            required
            value={form.displayName}
            onChange={update("displayName")}
            className="input"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-brand-900/80">
            {t("username")}
          </span>
          <input
            required
            value={form.username}
            onChange={updateUsername}
            minLength={3}
            maxLength={30}
            className="input"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-brand-900/80">
            {t("bio")}
          </span>
          <textarea
            value={form.bio}
            onChange={update("bio")}
            placeholder={t("bioPlaceholder")}
            maxLength={300}
            rows={3}
            className="input resize-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-brand-900/80">
            {t("promptpayId")}
          </span>
          <input
            value={form.promptpayId}
            onChange={update("promptpayId")}
            placeholder="0812345678"
            className="input"
          />
          <span className="mt-1 block text-xs text-brand-900/50">
            {t("promptpayHint")}
          </span>
        </label>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={status === "saving"}
          className="btn-primary w-full"
        >
          {status === "saving"
            ? tc("saving")
            : status === "saved"
              ? t("saved")
              : tc("save")}
        </button>
      </form>
    </div>
  );
}
