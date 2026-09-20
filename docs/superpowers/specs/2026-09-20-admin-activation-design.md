# Admin activation view + one-time nudge — design

**Date:** 2026-09-20
**Status:** approved in conversation, awaiting spec review

## Why

TipTang has 18 creator accounts. Only some of them actually receive tips; the
founder has not talked to the rest after signup and can reach only a few of
them directly. Before adding growth features we need to know *where* each
creator stops: signup → PromptPay set → overlay opened in OBS → first tip →
still receiving tips. Today the data for every step except "overlay opened"
already exists; nothing shows it.

Scope decided with the founder:

- An **Activation** section at the top of the existing `/admin` page.
- Track when the OBS overlay was last seen (`overlayLastSeenAt`).
- A per-creator **"ส่งเตือน" button** that emails **one** stage-specific
  reminder, **once per creator, ever**, only for the two stages the creator
  can fix themselves (no PromptPay / overlay never opened).
- Nothing automatic. No cron, no digest, no reminder for creators who have
  everything set up but no tips yet ("you can't force people to donate").

## 1. Data

### New columns on `User` (one migration)

| column | type | meaning |
|---|---|---|
| `overlayLastSeenAt` | `DateTime?` | last time the alert overlay polled `/api/overlay/[username]` with a valid key |
| `activationNudgeSentAt` | `DateTime?` | when the one-time reminder was sent; non-null = never send again |

Migration is hand-written (`prisma/migrations/<ts>_add_activation_tracking/migration.sql`),
deployed with `npx prisma migrate deploy` only after the founder says so, then
`npx prisma generate`.

### Recording `overlayLastSeenAt`

`GET /api/overlay/[username]` already does one `findUnique` per poll (every 3 s
per open overlay) to validate `overlayKey`. Add `overlayLastSeenAt` to that
existing `select` — no extra read. Then:

```ts
const STALE_MS = 5 * 60_000;
const fiveMinAgo = new Date(Date.now() - STALE_MS);
if (!user.overlayLastSeenAt || user.overlayLastSeenAt < fiveMinAgo) {
  after(async () => {
    try {
      await prisma.user.updateMany({
        where: {
          id: user.id,
          OR: [{ overlayLastSeenAt: null }, { overlayLastSeenAt: { lt: fiveMinAgo } }],
        },
        data: { overlayLastSeenAt: new Date() },
      });
    } catch (err) {
      console.error("[overlay] lastSeen update failed:", err);
    }
  });
}
```

- At most one write per creator per 5 minutes; the usual poll touches nothing.
- The `WHERE` repeats the staleness check so two OBS instances polling at the
  same moment cannot both write.
- `after()` (already used for tip emails) keeps it off the response path; the
  `try/catch` prevents an unhandled rejection.
- Only the alert route records it (every creator needs that one). The goal and
  timer overlay routes do not.
- `?test=1` preview never polls, so it never counts. A creator opening the
  overlay URL in a normal browser tab does count — that still means they got
  that far.
- A wrong key returns 403 before any of this runs.

## 2. Stage logic — `src/lib/activation.ts` (pure, unit-tested)

```ts
export type Stage = "NO_PROMPTPAY" | "NO_OVERLAY" | "NO_TIP" | "ACTIVE" | "IDLE";
export const ACTIVE_WINDOW_DAYS = 30;

export function stage(input: {
  promptpayId: string | null;
  overlayLastSeenAt: Date | null;
  lastConfirmedTipAt: Date | null;   // null = never had a CONFIRMED tip
}, now: Date): Stage
```

Rules, in order:

1. `promptpayId` empty → `NO_PROMPTPAY`
2. `lastConfirmedTipAt` set → `ACTIVE` if within `ACTIVE_WINDOW_DAYS`, else `IDLE`
   (checked before the overlay rule so creators who received tips before this
   feature existed — `overlayLastSeenAt` null — are not stuck at `NO_OVERLAY`)
3. `overlayLastSeenAt` null → `NO_OVERLAY`
4. otherwise → `NO_TIP`

Only **CONFIRMED** tips count. PENDING/REJECTED tips do not make a creator
"tipped".

`nudgeTemplate(stage)` returns `"NO_PROMPTPAY" | "NO_OVERLAY" | null` — null for
every other stage (no reminder for NO_TIP, ACTIVE, IDLE).

Sorting for the table: `stageOrder = [NO_PROMPTPAY, NO_OVERLAY, NO_TIP, IDLE, ACTIVE]`;
within a stage, the creator stuck longest first (oldest `createdAt` for the
first three stages, oldest `lastConfirmedTipAt` for IDLE, newest tip first for
ACTIVE).

## 3. Admin page

Server component inside the existing `/[locale]/admin/page.tsx`, gated by the
existing `requireAdmin()`. Placed **above** reports and reviews.

Query: all users with `id, username, displayName, email, createdAt,
promptpayId, overlayLastSeenAt, activationNudgeSentAt` plus, per user, count of
CONFIRMED tips, their sum, and `max(confirmedAt)` (one `groupBy` on `Tip`, not
N+1). The founder's own account (`isAdminEmail(email)`) is shown in the table
but excluded from the funnel counts.

**Funnel strip** — five tiles: ยังไม่ใส่พร้อมเพย์ · ยังไม่เปิด overlay ·
ยังไม่มีทิป · ใช้งานอยู่ (30 วัน) · หายไป. Counts add up to (creators − admin).

**Table** — one row per creator:

| column | content |
|---|---|
| ครีเอเตอร์ | displayName, `@username` linking to `/{locale}/{username}`, email in small text |
| สมัคร | relative time ("12 วันก่อน") |
| พร้อมเพย์ | ✓ / ✗ |
| overlay ล่าสุด | relative time · "ยังไม่เคย" · "ไม่มีข้อมูล" when null but the creator already has tips |
| ทิป | `count (฿sum)` of CONFIRMED tips |
| ทิปล่าสุด | relative time or "—" |
| สถานะ | badge: NO_PROMPTPAY grey · NO_OVERLAY yellow · NO_TIP orange · ACTIVE green · IDLE red |
| เตือน | `NudgeButton` (section 5) or "—" |

Relative times are formatted **on the server** (a small `relativeTimeTh/En`
helper in `src/lib/format.ts`, pinned to the same `now`) so nothing hydrates
differently in the browser. On phones the table scrolls horizontally.

i18n: new `admin.activation.*` keys in `messages/th.json` and `messages/en.json`.

## 4. One-time nudge

### `POST /api/admin/activation-nudge`

Body `{ userId: string, test?: boolean }`. Steps:

1. `requireAdmin()` → 401 otherwise.
2. Load the user (+ last confirmed tip) → 404 if missing.
3. `stage()` → `nudgeTemplate()`; if null → 400 `not_applicable`.
4. If `activationNudgeSentAt` already set → 409 `already_sent`.
5. **Claim first, send second:** `updateMany({ where: { id, activationNudgeSentAt: null }, data: { activationNudgeSentAt: now } })`. If `count === 0` → 409 (another click won the race).
6. `sendActivationNudgeEmail(user, template)`. On failure: reset the column to
   null and return 502 `send_failed`. We accept "not sent" over "sent twice".
7. 200 `{ sentAt }`.

**Test mode** (`test: true`): only allowed when the target user *is* the admin
(the founder's own account). Skips steps 3–5, sends the requested template
(`template: "NO_PROMPTPAY" | "NO_OVERLAY"` in the body) to the admin's email,
does not touch `activationNudgeSentAt`. This is how the founder previews both
emails before sending any to a real creator.

### `NudgeButton` (client)

Rendered only for stages NO_PROMPTPAY / NO_OVERLAY, and on the admin's own row
as two "ทดสอบ" buttons (one per template). States: "ส่งเตือน" → "กำลังส่ง…" →
"ส่งแล้ว 20 ก.ย." (disabled for good). Errors show inline; `already_sent`
flips the button to the sent state.

### Email copy — `sendActivationNudgeEmail` in `src/lib/email.ts`

Thai, plain, one link, from `TipTang <support@tiptang.com>`, Reply-To
support@. Subject: **"ติดตรงไหนบอกเราได้นะ — TipTang"**.

- **NO_PROMPTPAY:** สวัสดี {displayName} · เห็นว่าสมัคร TipTang ไว้แล้วแต่ยังไม่ได้ใส่พร้อมเพย์ — ใส่แค่เบอร์หรือเลขบัตรเดียว ก็รับทิปเข้าบัญชีตรงได้เลย · ปุ่ม **ไปหน้าตั้งค่า** → `https://tiptang.com/th/dashboard/settings`
- **NO_OVERLAY:** สวัสดี {displayName} · พร้อมเพย์เรียบร้อยแล้ว เหลือแค่เอา URL overlay ไปใส่ OBS ใช้เวลา 1 นาที · ปุ่ม **ดูวิธีตั้ง OBS** → `https://tiptang.com/th/dashboard/overlay`
- Both end with: "ถ้าติดตรงไหน ตอบเมลนี้บอกได้เลย เราอ่านทุกฉบับ"

Text and HTML variants, `esc()` for the display name, same as the existing
emails.

## 5. Testing

- `src/lib/activation.test.ts`: every `stage()` branch (no PromptPay; PromptPay
  but no overlay; overlay but no tip; only PENDING tips → NO_TIP; CONFIRMED tip
  29 days ago → ACTIVE; 31 days ago → IDLE; exactly 30 days → ACTIVE; tips but
  `overlayLastSeenAt` null → ACTIVE/IDLE, never NO_OVERLAY); `nudgeTemplate()`
  returns null for NO_TIP/ACTIVE/IDLE; sort order.
- `format.test.ts`: relative-time helper for minutes/hours/days in both locales.
- Manual on localhost (production DB, as always):
  1. `/th/admin` renders 18 rows, funnel adds up, admin row excluded from counts.
  2. Open own overlay with the real key in a tab → within one poll
     `overlayLastSeenAt` is set; admin shows "เมื่อสักครู่"; keep it open 2 more
     minutes → value unchanged (no re-write inside 5 min).
  3. Wrong key → 403, column untouched.
  4. Test buttons on own row → both emails arrive from support@; column stays null.
  5. Do **not** send a real nudge during testing.
- tsc, eslint (5 pre-existing errors, no more), `npm test`, `npm run build`.

## 6. Rollout

1. Branch `feat/admin-activation`.
2. Migration written by hand; `prisma migrate deploy` after explicit go-ahead;
   `prisma generate`.
3. Founder checks localhost; "merge push".
4. `overlayLastSeenAt` starts empty for everyone and fills in as creators open
   OBS — read the NO_OVERLAY column only after 1–2 weeks.

## Not in scope

Automatic/cron reminders · reminder for NO_TIP/ACTIVE/IDLE · `lastLoginAt` ·
charts · CSV export · any change to creator-facing pages.
