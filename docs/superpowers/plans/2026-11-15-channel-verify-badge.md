# Channel-owner badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creators ask for a channel-owner badge, the founder approves it in /admin, and the donate page shows a pink scalloped badge after the creator's name.

**Architecture:** Five nullable `User` columns hold the request. A pure module (`src/lib/channel-verify.ts`) owns every rule (which platforms, when a request is still valid, what the badge shows) so routes and pages only call it. Two small routes (creator, admin) change state; three components render it (dashboard card, admin section, donate-page badge).

**Tech Stack:** Next.js 16 app router, Prisma 7 (Postgres), next-intl, Tailwind, `node --test` for pure modules.

**Spec:** `docs/superpowers/specs/2026-11-15-channel-verify-badge-design.md`

## Global Constraints
- Verifiable keys, in this order: `youtube`, `twitch`, `tiktok`, `facebook`, `kick`, `instagram`, `x`. Never `discord` or `website`.
- Badge colour `#e8467f`, our own SVG path (the scalloped "แบบ 2" shown to the founder), white tick. Height equal to the name's text.
- Donate page shows no text next to the name; the explanation lives only in the tap popover.
- No emails, no automatic bio checks, no OAuth.
- Thai and English copy for every new string (`messages/th.json`, `messages/en.json`, namespace `channelVerify`).
- No production migration and no push without the founder's word; local DB is `prisma dev` `tiptang-hub2` (port 51230). Check `DIRECT_URL=<local> npx prisma migrate status` names `localhost:51230` before any migrate command.

## Review Focus
- A creator edits the verified channel URL (even one character) → badge gone on the donate page and the card shows "not requested".
- A creator removes the platform from their social links while pending → the request disappears from /admin's pending list.
- Two admin clicks (approve then reject, or double approve) → the second only applies if the state still allows it (approve needs PENDING).
- A creator requests for a key that isn't in their saved links, or for `discord` → 400, nothing stored.
- A non-admin calls the admin route → 401; a logged-out user calls the creator route → 401.

---

### Task 1: Rules module + schema + migration

**Files:**
- Create: `src/lib/channel-verify.ts`, `src/lib/channel-verify.test.ts`
- Modify: `prisma/schema.prisma` (enum + 5 `User` columns)
- Create: `prisma/migrations/20261115000000_channel_verify/migration.sql`

**Interfaces:**
- Produces:
  - `type ChannelVerifyStatus = "PENDING" | "VERIFIED" | "REJECTED"`
  - `VERIFIABLE_KEYS: readonly SocialKey[]` (order above)
  - `verifiableLinks(socials: SocialLinks): { key: SocialKey; url: string }[]`
  - `requestStillValid(key: string | null, url: string | null, socials: SocialLinks): boolean` — true only when `key` is verifiable and `socials[key] === url`
  - `badgeFor(u: { channelVerifyStatus: ChannelVerifyStatus | null; channelVerifyKey: string | null; channelVerifyUrl: string | null }, socials: SocialLinks): { key: SocialKey; url: string; label: string } | null` — non-null only when VERIFIED and `requestStillValid`; `label` from `SOCIAL_PLATFORMS`
  - `CLEARED_VERIFY` = the update object setting all five columns to null
- Prisma: `enum ChannelVerifyStatus { PENDING VERIFIED REJECTED }`; `User.channelVerifyStatus ChannelVerifyStatus?`, `channelVerifyKey String?`, `channelVerifyUrl String?`, `channelVerifyRequestedAt DateTime?`, `channelVerifiedAt DateTime?`

- [ ] **Step 1: Tests** — `verifiableLinks` drops discord/website and keeps the order; `requestStillValid` false when URL differs by one char, when key missing, when key is `discord`; `badgeFor` null for PENDING/REJECTED/null, null when URL changed, `{key:"youtube", url, label:"YouTube"}` when VERIFIED and matching.
- [ ] **Step 2: Run** `node --test src/lib/channel-verify.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** the module (no `server-only`, so it runs under node --test).
- [ ] **Step 4: Run** again → PASS.
- [ ] **Step 5: Schema + migration** — add enum and columns; migration SQL `CREATE TYPE "ChannelVerifyStatus" AS ENUM ('PENDING','VERIFIED','REJECTED');` then five `ALTER TABLE "User" ADD COLUMN ...`. Apply locally only (`DIRECT_URL=<local> npx prisma migrate deploy` after the status check), `npx prisma generate`, `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** `Channel badge: rules module, User columns and migration`.

### Task 2: Creator route + profile save clean-up

**Files:**
- Create: `src/app/api/channel-verify/route.ts`
- Modify: `src/app/api/profile/route.ts` (after socials are saved)

**Interfaces:**
- Consumes: Task 1 module.
- Produces: `POST /api/channel-verify` body `{ key: string }` → 200 `{ status: "PENDING" }`; 400 `{ error: "invalid" }` when key not in `verifiableLinks(saved socials)`; 401 when logged out. Stores key, the saved URL, `PENDING`, `channelVerifyRequestedAt = now`, `channelVerifiedAt = null`. `DELETE /api/channel-verify` → 200, writes `CLEARED_VERIFY` (cancel a pending request or drop a badge).
- Profile PATCH: when `cleanSocials` is defined and `requestStillValid(current key, current url, cleanSocials)` is false while a status exists → also write `CLEARED_VERIFY` in the same update.

- [ ] **Step 1:** Implement both handlers with `auth()` and zod (`z.object({ key: z.string().min(1).max(20) })`); read socials from the DB, never from the body.
- [ ] **Step 2:** Profile route: select the three verify fields in the existing `before` read and merge `CLEARED_VERIFY` into `data` when the rule says so.
- [ ] **Step 3: Verify** `npx tsc --noEmit` and `npx eslint` on both files clean; `npm test` green.
- [ ] **Step 4: Commit** `Channel badge: creator request route; editing the verified link clears it`.

### Task 3: Admin route + admin section

**Files:**
- Create: `src/app/api/admin/channel-verify/route.ts`, `src/components/ChannelVerifyAdminRow.tsx`, `src/components/ChannelVerifySection.tsx`
- Modify: `src/app/[locale]/admin/page.tsx` (render the section after `<ActivationSection />`), `messages/th.json`, `messages/en.json`

**Interfaces:**
- Produces: `POST /api/admin/channel-verify` body `{ userId, action: "approve" | "reject" | "revoke" }` via `requireAdmin()` → 401 otherwise. Each action is a conditional `updateMany` so a stale click does nothing: approve `where {id, channelVerifyStatus: "PENDING"}` → VERIFIED + `channelVerifiedAt = now`; reject `where PENDING` → REJECTED; revoke `where VERIFIED` → REJECTED. Returns `{ ok: true, changed: count > 0 }`.
- Section (server component, `locale` prop, like `ActivationSection`): "คำขอยืนยันช่อง (n)" listing PENDING users oldest request first with display name, @username, platform label + channel link (`target="_blank" rel="noopener noreferrer"`), the link to look for `tiptang.com/<username>`, request date, approve / reject; then "ได้เครื่องหมายแล้ว" listing VERIFIED users with revoke. Rows whose request is no longer valid (`requestStillValid` false) are left out.
- Row: client component modelled on `ReviewModRow` (fetch → `router.refresh()`), revoke asks `confirm()` first.

- [ ] **Step 1:** Route. **Step 2:** Row + section + copy (th/en). **Step 3:** Mount in admin page.
- [ ] **Step 4: Verify** typecheck, lint, `npm test`.
- [ ] **Step 5: Commit** `Channel badge: admin approve, reject and revoke`.

### Task 4: Dashboard card

**Files:**
- Create: `src/components/ChannelVerifyCard.tsx`
- Modify: `src/app/[locale]/dashboard/settings/page.tsx` (select the verify fields; render the card below `<SettingsForm>`), `messages/th.json`, `messages/en.json`

**Interfaces:**
- Consumes: `verifiableLinks`, `requestStillValid`, `badgeFor`; routes from Task 2.
- Props: `{ username: string; links: { key; url; label }[]; status: ChannelVerifyStatus | null; key: string | null; url: string | null }` (server passes `status: null` when the stored request is no longer valid).
- States (Thai copy): none → select of `links` + steps "1. ใส่ลิงก์ tiptang.com/<username> ในคำอธิบายช่องหรือไบโอ 2. กดขอเครื่องหมาย" + button "ขอเครื่องหมาย"; no links → "เพิ่มลิงก์ช่องในส่วนโซเชียลด้านบนแล้วกดบันทึกก่อน"; PENDING → "รอตรวจ" + platform + button "ยกเลิกคำขอ"; VERIFIED → badge + "ยืนยันแล้ว: <Platform>" + "ถ้าแก้ลิงก์ช่องนี้ เครื่องหมายจะหายและต้องขอใหม่"; REJECTED → "ไม่ผ่าน ตรวจว่าลิงก์อยู่ในคำอธิบายช่องแล้วขอใหม่ได้" + the request form again. Copy button for the TipTang link.

- [ ] **Step 1:** Card + copy. **Step 2:** Wire into settings page.
- [ ] **Step 3: Verify** typecheck, lint, `npm test`.
- [ ] **Step 4: Commit** `Channel badge: request card on the profile page`.

### Task 5: Donate-page badge

**Files:**
- Create: `src/components/VerifiedBadge.tsx`
- Modify: `src/app/[locale]/[username]/page.tsx` (select verify fields; put `<VerifiedBadge>` inside the `h1`, after the name, when `badgeFor(...)` is non-null), `messages/th.json`, `messages/en.json`

**Interfaces:**
- Consumes: `badgeFor`.
- Props: `{ label: string; url: string }`. A `button` with `aria-label` "ยืนยันเจ้าของช่องแล้ว", SVG sized `1em` so it matches the name; click toggles a small popover "ยืนยันแล้วว่าเป็นเจ้าของช่อง <label>" + link "ดูช่อง" (`target="_blank" rel="noopener noreferrer"`); closes on outside click and Escape. SVG path (viewBox 0 0 24 24): scallop `M12 1.2l2.3 2.2 3.1-.6.9 3 3 .9-.6 3.1 2.2 2.3-2.2 2.3.6 3.1-3 .9-.9 3-3.1-.6-2.3 2.2-2.3-2.2-3.1.6-.9-3-3-.9.6-3.1L1.2 12l2.2-2.3-.6-3.1 3-.9.9-3 3.1.6z` fill `#e8467f`; tick `M7.4 12.3l3.1 3.1 6.1-6.6` stroke white 2.3 round.

- [ ] **Step 1:** Component + copy. **Step 2:** Wire into the donate page.
- [ ] **Step 3: Verify** typecheck, lint, `npm test`.
- [ ] **Step 4: Commit** `Channel badge: pink badge after the name on the donate page`.

### Task 6: Founder test locally
- [ ] Local DB `tiptang-hub2` up, `tiptang-dev` preview running.
- [ ] Walk through as `renametest` (has PromptPay): add a YouTube link, request, see pending; as the founder's local admin account approve in /admin; open `/th/renametest`, see the badge and popover; edit the YouTube link, see the badge gone. Fix anything found, then hand the URLs to the founder. Push and production migration only on their word.
