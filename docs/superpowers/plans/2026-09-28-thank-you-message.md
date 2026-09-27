# Thank-you Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Optional creator thank-you message shown on the post-tip success screen, plus an
accurate status line. **Spec:** `docs/superpowers/specs/2026-09-28-thank-you-message-design.md`.

**Constraints:** migration only after the founder's go-ahead · lint stays at 5 · plain text only ·
never push before "merge push" · commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Task 1: Schema + migration
- [ ] `prisma/schema.prisma` model User, after `paypalHandle String?`:
  `// Shown to supporters on the success screen after they tip. Null = none.` / `thankYouMessage String?`
- [ ] `prisma/migrations/20260928000000_add_thank_you_message/migration.sql`:
  `ALTER TABLE "User" ADD COLUMN "thankYouMessage" TEXT;`
- [ ] `npx prisma generate`; `npx tsc --noEmit`; commit.

### Task 2: API + settings
- [ ] `src/lib/validators.ts` profileSchema, after `paypalHandle`:
  `thankYouMessage: z.string().trim().max(300).optional().or(z.literal("")),`
- [ ] `src/app/api/profile/route.ts`: destructure `thankYouMessage`; in `data` add
  `...(thankYouMessage === undefined ? {} : { thankYouMessage: thankYouMessage || null }),`
- [ ] `SettingsForm.tsx`: `Initial.thankYouMessage: string`; `snapshot` field; in the
  "หน้าโดเนท" Section, after the colour `<div>`, a labelled `<textarea rows={3} maxLength={300}>`
  bound to `form.thankYouMessage` with a right-aligned `{n}/300` counter and hint.
- [ ] settings page: select + `initial.thankYouMessage: user.thankYouMessage ?? ""`.
- [ ] i18n `settings.thankYou`, `settings.thankYouPlaceholder`, `settings.thankYouHint` (th + en).
- [ ] tsc/eslint; commit.

### Task 3: Success screen
- [ ] Donate page: select `thankYouMessage`; pass `thankYouMessage`, `creatorAvatar={creator.avatarUrl}` to `<TipForm>`.
- [ ] `TipForm`: props `thankYouMessage?: string | null`, `creatorAvatar?: string | null`. In the
  `done` screen, between the title and the status text, when `thankYouMessage` is set:

```tsx
<figure className="mx-auto mt-5 max-w-md rounded-2xl bg-white/70 p-4 text-left shadow-sm dark:bg-white/5">
  <figcaption className="flex items-center gap-2 text-sm font-semibold text-brand-900">
    {creatorAvatar ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={creatorAvatar} alt="" className="h-8 w-8 rounded-full object-cover" />
    ) : (
      <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-brand-700">
        {creatorName.charAt(0).toUpperCase()}
      </span>
    )}
    {creatorName}
  </figcaption>
  <blockquote className="mt-2 whitespace-pre-line break-words text-brand-900/85">
    {thankYouMessage}
  </blockquote>
</figure>
```

  and the status line becomes `text-sm` with key chosen by `autoVerified` × `isPublic`:
  `messageAuto` / `messageAutoPrivate` / `message` / `messagePrivate`.
- [ ] i18n `tipSuccess.messagePrivate`, `tipSuccess.messageAutoPrivate`; reword `tipSuccess.message`
  ("…เมื่อครีเอเตอร์ยืนยันการโอนแล้ว") in th + en.
- [ ] tsc/eslint/test/build; commit.

### Task 4: Migrate + verify on localhost (after go-ahead)
- [ ] `npx prisma migrate deploy && npx prisma generate`.
- [ ] Set a two-line message, private test tip, check card + status text, delete the tip,
  check > 300 chars via PATCH → 400, clear or keep the message as the founder prefers.
