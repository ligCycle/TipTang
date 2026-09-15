# Settings Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the one-card settings page into four titled sections (profile · payments · donate page · account) with a sticky save bar that appears only while there are unsaved changes.

**Architecture:** `SettingsForm` stays the single client component that owns the form state and the existing `PATCH /api/profile` submit; it gains a `savedForm` snapshot for dirty detection, a `Section` helper, and a sticky `SaveBar` rendered as the last child of the `<form>`. `ConnectedAccounts` loses its card and becomes the content of the fourth section. No API, schema, or cropper changes.

**Tech Stack:** Next.js 16 App Router, React 19 client component, next-intl, Tailwind v4.

Spec: `docs/superpowers/specs/2026-09-15-settings-sections-design.md`

## Global Constraints

- Do NOT modify `src/app/api/**`, `prisma/**`, `ImageCropper.tsx`, `ColorField.tsx`.
- `npm run lint` must stay at exactly **5** `react-hooks/set-state-in-effect` errors — the `beforeunload` effect must not call setState.
- Dirty comparison is `JSON.stringify` of a fixed-key snapshot; `avatarUrl`/`coverUrl` are excluded.
- Section headings: `text-xs font-semibold uppercase tracking-wide text-brand-900/60` + `<Icon>`.
- All `input`/`textarea` in the form carry `scroll-mb-24`.
- Bash heredocs break on `'` here — write source files with the Write tool; splice JSON with Python.
- Branch `settings-sections` off `main`. Do not push; the user tests first.
- Test edits on the production DB must be reverted in the same session (save the original value back).

---

### Task 0: Branch + docs

- [ ] **Step 1**
```bash
git checkout -b settings-sections main
git add docs/superpowers/specs/2026-09-15-settings-sections-design.md docs/superpowers/plans/2026-09-15-settings-sections.md
git commit -m "Add spec + plan: settings page sections + sticky save bar

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 1: i18n keys

**Files:** `messages/th.json`, `messages/en.json` (`settings` namespace)

- [ ] **Step 1: Edit both files with Python**

th: replace `"title": "ตั้งค่าโปรไฟล์",` → `"title": "ตั้งค่า",`; after the `connectGoogleHint` line insert
```json
    "sectionProfile": "โปรไฟล์",
    "sectionPayment": "การรับเงิน",
    "sectionDonate": "หน้าโดเนท",
    "sectionAccount": "บัญชี",
    "unsavedChanges": "มีการแก้ไขที่ยังไม่บันทึก",
    "discard": "ยกเลิก",
```
delete the five lines `goalSection`, `goalTitle`, `goalTitlePlaceholder`, `goalAmount`, `goalHint`.

en: `"title": "Profile settings",` → `"title": "Settings",`; insert
```json
    "sectionProfile": "Profile",
    "sectionPayment": "Payments",
    "sectionDonate": "Donate page",
    "sectionAccount": "Account",
    "unsavedChanges": "You have unsaved changes",
    "discard": "Discard",
```
delete the same five goal lines.

- [ ] **Step 2: Validate + confirm nothing references the deleted keys**
```bash
grep -rn "goalSection\|goalTitlePlaceholder\|\"goalHint\"" src messages
```
Expected: no output. JSON parses (Python `json.loads` in the same script).

- [ ] **Step 3: Commit**
```bash
git add messages/th.json messages/en.json
git commit -m "Settings strings: section titles, unsaved-changes bar; drop dead goal keys

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `ConnectedAccounts` without its card

**Files:** Modify `src/components/ConnectedAccounts.tsx`

**Interfaces:** props unchanged `{ googleConnected: boolean; accountEmail: string; googleAuthEnabled: boolean }`; still returns `null` when `!googleAuthEnabled`.

- [ ] **Step 1: Replace the returned JSX** (keep the `GoogleIcon` and imports as they are)

```tsx
  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-100 bg-brand-50/40 p-3">
        <span className="flex items-center gap-3 font-medium text-brand-900">
          <GoogleIcon /> Google
        </span>
        {googleConnected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
            <Icon name="check" className="h-3.5 w-3.5" />
            {t("connected")}
          </span>
        ) : (
          <button
            type="button"
            onClick={() =>
              signIn("google", { callbackUrl: "/dashboard/settings" })
            }
            className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t("connectGoogle")}
          </button>
        )}
      </div>
      {!googleConnected && (
        <p className="mt-2 text-xs text-brand-900/50">
          {t("connectGoogleHint", { email: accountEmail })}
        </p>
      )}
    </div>
  );
```
(The `<h2>{t("connectedAccounts")}</h2>` and `<p>{t("connectedAccountsHint")}</p>` move to the section header in Task 3.)

- [ ] **Step 2: Commit**
```bash
git add src/components/ConnectedAccounts.tsx
git commit -m "ConnectedAccounts: drop the card; the settings page frames it now

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `SettingsForm` sections + sticky save bar; page wiring

**Files:**
- Rewrite `src/components/SettingsForm.tsx` (upload/crop/submit logic kept verbatim)
- Modify `src/app/[locale]/dashboard/settings/page.tsx`

**Interfaces:**
- `SettingsForm` props become `{ initial: Initial; account: { googleConnected: boolean; accountEmail: string; googleAuthEnabled: boolean } }`.

- [ ] **Step 1: Rewrite `SettingsForm.tsx`**

```tsx
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
```

- [ ] **Step 2: Wire the page**

In `src/app/[locale]/dashboard/settings/page.tsx`: remove the `ConnectedAccounts` import; change `max-w-lg` → `max-w-xl`; replace the JSX with
```tsx
    <div className="mx-auto max-w-xl">
      <SettingsForm
        initial={{
          displayName: user.displayName,
          username: user.username,
          bio: user.bio ?? "",
          promptpayId: user.promptpayId ?? "",
          avatarUrl: user.avatarUrl ?? "",
          coverUrl: user.coverUrl ?? "",
          autoConfirmTips: user.autoConfirmTips,
          socialLinks: normalizeSocialLinks(user.socialLinks),
          profileColor: user.profileColor ?? "",
        }}
        account={{
          googleConnected: Boolean(user.googleId),
          accountEmail: user.email,
          googleAuthEnabled,
        }}
      />
    </div>
```

- [ ] **Step 3: Checks**
```bash
npx tsc --noEmit
npm run lint
```
Expected: tsc clean; lint exactly 5 errors (none in SettingsForm/ConnectedAccounts). `grep -rn "ConnectedAccounts" src` → only `SettingsForm.tsx` and the component file.

- [ ] **Step 4: Commit**
```bash
git add src/components/SettingsForm.tsx "src/app/[locale]/dashboard/settings/page.tsx"
git commit -m "Settings page: four sections, sticky save bar only while dirty

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Browser verification (logged in)

- [ ] `npm run build` → ok; `rm -rf .next`; restart `tiptang-dev`.
- [ ] `/th/dashboard/settings`: 4 `section h2` in order โปรไฟล์/การรับเงิน/หน้าโดเนท/บัญชี · `.card` count 0 · no `role=status` bar.
- [ ] Type a character into displayName → bar appears (`role=status` text = "มีการแก้ไขที่ยังไม่บันทึก", `.card` = 1) → click "ยกเลิก" → value restored, bar gone.
- [ ] Deep-compare proof: change one social field, then change it back → bar gone.
- [ ] Save round trip: append " x" to bio → Save → bar says "บันทึกแล้ว!" → gone within 2s → reload shows new bio → remove " x" → Save (prod data restored).
- [ ] Username clash: set username `nongmewtumarai` → Save → red "ชื่อลิงก์นี้ถูกใช้แล้ว" in bar → ยกเลิก.
- [ ] `beforeunload`: with dirty state run `const e=new Event('beforeunload',{cancelable:true}); window.dispatchEvent(e); e.defaultPrevented` → `true`; when clean → `false`.
- [ ] Mobile 375: `scrollWidth <= 375`; bar wraps cleanly. Dark + light screenshots. Reset viewport.
- [ ] Report; do not push.

## Self-review
- Spec coverage: sections/no cards (T2, T3), sticky dirty bar + discard + saved/error (T3), images excluded (snapshot), beforeunload w/ documented limit (T3 effect), scroll-mb-24 (inputClass — note the checkbox does not need it), no API/schema, dead keys removed (T1), page wiring incl. `account` prop (T3), tests (T4).
- Types: `Account` shape identical in T3 component and page; `IconName` import exists in `Icon.tsx` (exported type).
- `Section` uses `first:pt-0` so the first section has no top padding under the h1; `divide-y` supplies the separators.
