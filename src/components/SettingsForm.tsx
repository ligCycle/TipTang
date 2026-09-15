"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ImageCropper } from "./ImageCropper";
import { ColorField } from "./ColorField";
import { ConnectedAccounts } from "./ConnectedAccounts";
import { SOCIAL_PLATFORMS, type SocialLinks } from "@/lib/socials";
import { SocialIcon } from "@/components/SocialIcon";
import { DEFAULT_COLOR, PRESET_COLORS } from "@/lib/colors";
import { Icon, type IconName } from "@/components/Icon";

type Initial = {
  displayName: string;
  username: string;
  bio: string;
  promptpayId: string;
  avatarUrl: string;
  coverUrl: string;
  autoConfirmTips: boolean;
  socialLinks: SocialLinks;
  profileColor: string;
};

type Account = {
  googleConnected: boolean;
  accountEmail: string;
  googleAuthEnabled: boolean;
};

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

// Every input/textarea gets scroll-mb-24 so that when a phone keyboard
// opens and the browser scrolls the focused field into view, it leaves
// room underneath for the sticky save bar instead of hiding the field.
const inputClass = "input scroll-mb-24";
const labelClass = "mb-1 block text-sm font-medium text-brand-900/80";
const hintClass = "mt-1 block text-xs text-brand-900/50";

/**
 * The fields the Save button actually sends, in a FIXED key order, so two
 * snapshots can be compared as strings. Images are deliberately left out:
 * they upload and persist on their own, so they never count as unsaved.
 */
function snapshot(f: Initial): string {
  return JSON.stringify({
    displayName: f.displayName,
    username: f.username,
    bio: f.bio,
    promptpayId: f.promptpayId,
    autoConfirmTips: f.autoConfirmTips,
    profileColor: f.profileColor,
    socialLinks: SOCIAL_PLATFORMS.map((p) => f.socialLinks[p.key] ?? ""),
  });
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: IconName;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="py-6 first:pt-0">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
        <Icon name={icon} />
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-brand-900/60">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function SettingsForm({
  initial,
  account,
}: {
  initial: Initial;
  account: Account;
}) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const router = useRouter();
  const [form, setForm] = useState(initial);
  // What the database currently holds. Updated after every successful save.
  const [savedForm, setSavedForm] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);
  const [cropping, setCropping] = useState<{
    kind: "avatar" | "cover";
    file: File;
  } | null>(null);

  const dirty = snapshot(form) !== snapshot(savedForm);

  // Warn on tab close / reload while there are unsaved edits. This does
  // NOT fire for in-app <Link> navigation — the App Router has no hook for
  // that — which is why the save bar stays visible instead.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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

  // Put the text fields back to what is saved; keep any image uploaded
  // since (it is already in the DB).
  function discard() {
    setForm((f) => ({
      ...savedForm,
      avatarUrl: f.avatarUrl,
      coverUrl: f.coverUrl,
    }));
    setError(null);
    setStatus("idle");
  }

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
      setSavedForm(form);
      setStatus("saved");
      router.refresh();
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    }
  }

  const showBar = dirty || status !== "idle";

  return (
    <div>
      {cropping && (
        <ImageCropper
          file={cropping.file}
          aspect={cropping.kind === "avatar" ? 1 : 3}
          cropShape={cropping.kind === "avatar" ? "round" : "rect"}
          onCancel={() => setCropping(null)}
          onCropped={(blob) => doUpload(cropping.kind, blob)}
        />
      )}
      <h1 className="mb-6 text-2xl font-extrabold text-brand-900">{t("title")}</h1>

      <form onSubmit={onSubmit} className="divide-y divide-brand-900/10">
        <Section icon="user" title={t("sectionProfile")}>
          {/* Cover + avatar upload — persist immediately, not via Save */}
          <div>
            <span className={labelClass}>{t("cover")}</span>
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
                  {uploading === "avatar" ? (
                    "..."
                  ) : (
                    <Icon name="pencil" className="h-3.5 w-3.5" />
                  )}
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

          <label className="block">
            <span className={labelClass}>{t("displayName")}</span>
            <input
              required
              value={form.displayName}
              onChange={update("displayName")}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>{t("username")}</span>
            <input
              required
              value={form.username}
              onChange={updateUsername}
              minLength={3}
              maxLength={30}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>{t("bio")}</span>
            <textarea
              value={form.bio}
              onChange={update("bio")}
              placeholder={t("bioPlaceholder")}
              maxLength={300}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </label>
        </Section>

        <Section icon="credit-card" title={t("sectionPayment")}>
          <label className="block">
            <span className={labelClass}>{t("promptpayId")}</span>
            <input
              value={form.promptpayId}
              onChange={update("promptpayId")}
              placeholder="0812345678"
              className={inputClass}
            />
            <span className={hintClass}>{t("promptpayHint")}</span>
          </label>

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
        </Section>

        <Section icon="palette" title={t("sectionDonate")}>
          <div>
            <p className={labelClass}>{t("profileColorSection")}</p>
            <ColorField
              value={form.profileColor || null}
              fallback={DEFAULT_COLOR}
              presets={PRESET_COLORS}
              label={t("profileColor")}
              codeLabel={t("profileColorCode")}
              resetLabel={t("profileColorReset")}
              defaultLabel={t("profileColorDefault")}
              onSave={(hex) => setForm((f) => ({ ...f, profileColor: hex }))}
              onReset={() => setForm((f) => ({ ...f, profileColor: "" }))}
            />
            <span className={hintClass}>{t("profileColorHint")}</span>
          </div>

          <div>
            <p className={labelClass}>{t("socialSection")}</p>
            <div className="space-y-2">
              {SOCIAL_PLATFORMS.map((p) => (
                <label key={p.key} className="flex items-center gap-2">
                  <span
                    className="flex w-24 shrink-0 items-center gap-1.5 text-sm text-brand-900/70"
                    title={p.label}
                  >
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white ring-1 ring-black/5">
                      <SocialIcon platform={p.key} className="h-3.5 w-3.5" />
                    </span>
                    {p.label}
                  </span>
                  <input
                    type="url"
                    inputMode="url"
                    value={form.socialLinks[p.key] ?? ""}
                    onChange={updateSocial(p.key)}
                    placeholder={p.placeholder}
                    className={`${inputClass} flex-1 text-sm`}
                  />
                </label>
              ))}
            </div>
            <span className={hintClass}>{t("socialHint")}</span>
          </div>
        </Section>

        {account.googleAuthEnabled && (
          <Section
            icon="link"
            title={t("sectionAccount")}
            hint={t("connectedAccountsHint")}
          >
            <ConnectedAccounts
              googleConnected={account.googleConnected}
              accountEmail={account.accountEmail}
              googleAuthEnabled={account.googleAuthEnabled}
            />
          </Section>
        )}

        {/* Sticky save bar — last child of the form so it floats at the
            bottom of the viewport while scrolling and settles into place
            at the end. Only rendered while there is something to say. */}
        {showBar && (
          <div
            role="status"
            className="card sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-3 shadow-lg"
          >
            <span
              className={`text-sm font-medium ${
                error ? "text-red-600" : "text-brand-900/80"
              }`}
            >
              {error
                ? error
                : status === "saved"
                  ? t("saved")
                  : t("unsavedChanges")}
            </span>
            <div className="flex gap-2">
              {status !== "saving" && status !== "saved" && (
                <button
                  type="button"
                  onClick={discard}
                  className="btn-secondary px-4 py-2 text-sm"
                >
                  {t("discard")}
                </button>
              )}
              <button
                type="submit"
                disabled={!dirty || status === "saving"}
                className="btn-primary px-4 py-2 text-sm"
              >
                {status === "saving" ? tc("saving") : tc("save")}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
