"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ImageCropper } from "./ImageCropper";
import { SOCIAL_PLATFORMS, type SocialLinks } from "@/lib/socials";

type Initial = {
  displayName: string;
  username: string;
  bio: string;
  promptpayId: string;
  avatarUrl: string;
  coverUrl: string;
  autoConfirmTips: boolean;
  goalTitle: string;
  goalAmount: string;
  socialLinks: SocialLinks;
};

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export function SettingsForm({ initial }: { initial: Initial }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const [cropping, setCropping] = useState<{
    kind: "avatar" | "cover";
    file: File;
  } | null>(null);

  // Pick a file -> validate -> open the cropper (upload happens after cropping).
  function onPick(
    kind: "avatar" | "cover",
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError(null);
    if (!ALLOWED.includes(file.type) || file.size > MAX_BYTES) {
      setError(t("imageError"));
      return;
    }
    setCropping({ kind, file });
  }

  async function doUpload(kind: "avatar" | "cover", blob: Blob) {
    setCropping(null);
    setUploading(kind);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", new File([blob], `${kind}.jpg`, { type: "image/jpeg" }));
      const res = await fetch("/api/profile/image", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(t("imageError"));
        return;
      }
      setForm((f) => ({
        ...f,
        [kind === "avatar" ? "avatarUrl" : "coverUrl"]: data.url as string,
      }));
      router.refresh();
    } catch {
      setError(t("imageError"));
    } finally {
      setUploading(null);
    }
  }

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

  const updateSocial =
    (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({
        ...f,
        socialLinks: { ...f.socialLinks, [key]: e.target.value },
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
      {cropping && (
        <ImageCropper
          file={cropping.file}
          aspect={cropping.kind === "avatar" ? 1 : 3}
          cropShape={cropping.kind === "avatar" ? "round" : "rect"}
          onCancel={() => setCropping(null)}
          onCropped={(blob) => doUpload(cropping.kind, blob)}
        />
      )}
      <h1 className="mb-6 text-2xl font-bold text-brand-900">{t("title")}</h1>

      {/* Cover + avatar upload */}
      <div className="mb-6">
        <span className="mb-1 block text-sm font-medium text-brand-900/80">
          {t("cover")}
        </span>
        <label className="group relative block h-32 cursor-pointer overflow-hidden rounded-2xl border border-brand-200 bg-brand-100">
          {form.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.coverUrl}
              alt="cover"
              className="h-full w-full object-cover"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-sm font-semibold text-white opacity-0 transition group-hover:opacity-100">
            {uploading === "cover" ? t("uploading") : t("changeImage")}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => onPick("cover", e)}
            className="hidden"
          />
        </label>

        <div className="-mt-8 ml-4 flex items-end gap-3">
          <label className="group relative block h-20 w-20 cursor-pointer overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-brand-400 to-brand-600 shadow">
            {form.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.avatarUrl}
                alt="avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl font-black text-white">
                {form.displayName.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100">
              {uploading === "avatar" ? "..." : "✎"}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => onPick("avatar", e)}
              className="hidden"
            />
          </label>
          <span className="pb-1 text-xs text-brand-900/50">
            {t("avatar")} · {t("imageHint")}
          </span>
        </div>
      </div>

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

        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={form.autoConfirmTips}
              onChange={(e) =>
                setForm((f) => ({ ...f, autoConfirmTips: e.target.checked }))
              }
              className="mt-0.5 h-4 w-4 accent-brand-600"
            />
            <span>
              <span className="block text-sm font-medium text-brand-900/80">
                {t("autoConfirm")}
              </span>
              <span className="mt-0.5 block text-xs text-brand-900/55">
                {t("autoConfirmHint")}
              </span>
            </span>
          </label>
        </div>

        {/* Fundraising goal */}
        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
          <p className="mb-3 text-sm font-semibold text-brand-900/80">
            🎯 {t("goalSection")}
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-brand-900/80">
              {t("goalTitle")}
            </span>
            <input
              value={form.goalTitle}
              onChange={update("goalTitle")}
              placeholder={t("goalTitlePlaceholder")}
              maxLength={80}
              className="input"
            />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-medium text-brand-900/80">
              {t("goalAmount")}
            </span>
            <input
              type="number"
              min={0}
              max={100000000}
              value={form.goalAmount}
              onChange={update("goalAmount")}
              placeholder="5000"
              className="input"
            />
            <span className="mt-1 block text-xs text-brand-900/50">
              {t("goalHint")}
            </span>
          </label>
        </div>

        {/* Social links */}
        <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4">
          <p className="mb-3 text-sm font-semibold text-brand-900/80">
            🔗 {t("socialSection")}
          </p>
          <div className="space-y-2">
            {SOCIAL_PLATFORMS.map((p) => (
              <label key={p.key} className="flex items-center gap-2">
                <span
                  className="w-24 shrink-0 text-sm text-brand-900/70"
                  title={p.label}
                >
                  {p.icon} {p.label}
                </span>
                <input
                  type="url"
                  inputMode="url"
                  value={form.socialLinks[p.key] ?? ""}
                  onChange={updateSocial(p.key)}
                  placeholder={p.placeholder}
                  className="input flex-1 text-sm"
                />
              </label>
            ))}
          </div>
          <span className="mt-2 block text-xs text-brand-900/50">
            {t("socialHint")}
          </span>
        </div>

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
