# Admin Activation View + One-Time Nudge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the founder, on `/admin`, where each of the 18 creators stops in the activation funnel (PromptPay → overlay opened → first tip → still active), and let them send one stage-specific reminder email per creator, once ever.

**Architecture:** Two nullable columns on `User` (`overlayLastSeenAt`, written at most once per 5 min from the overlay poll route; `activationNudgeSentAt`, the once-ever guard). A pure `src/lib/activation.ts` decides the stage and sort order. The admin page renders a server-side funnel + table; a small client `NudgeButton` posts to `/api/admin/activation-nudge`, which claims the guard column before sending through the existing Resend-backed `sendEmail`.

**Tech Stack:** Next.js 16 App Router (server components, `after()` from `next/server`), Prisma 7 + PostgreSQL (Supabase, production DB is used locally), Auth.js (`requireAdmin`), next-intl, Tailwind v4, Node 26 `node --test` for unit tests (`npm test` runs `src/**/*.test.ts`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-20-admin-activation-design.md`.
- Migrations are hand-written SQL under `prisma/migrations/<timestamp>_<name>/migration.sql`; `npx prisma migrate deploy` runs **only after the founder explicitly says so**; then `npx prisma generate`.
- Never push. The founder says "merge push" when ready.
- ESLint must stay at exactly **5** pre-existing `react-hooks/set-state-in-effect` errors — add none.
- `formatDate` is pinned to `Asia/Bangkok`; any new time formatting must be computed on the server or be timezone-independent (no hydration mismatches).
- Only **CONFIRMED** tips count as "tipped". `ACTIVE_WINDOW_DAYS = 30`.
- Reminder emails only for stages `NO_PROMPTPAY` and `NO_OVERLAY`; never for `NO_TIP`, `ACTIVE`, `IDLE`. Once per creator, ever. Claim `activationNudgeSentAt` before sending; reset on send failure.
- Test mode (`test: true`) only for the admin's own account, never sets the guard column.
- Overlay `lastSeen` write: piggyback on the existing `findUnique`, no extra read; conditional `updateMany` inside `after()` with `try/catch`; threshold 5 minutes.
- Do not send a real nudge to any creator during development or testing.
- Thai copy uses "โดเนท" (not "โดเนต"). Sender is `TipTang <support@tiptang.com>` (already configured via `RESEND_FROM`).
- Bash heredocs with `'` are unreliable here — write source files with the Write tool.

---

## File structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | two new nullable `DateTime` columns on `User` |
| `prisma/migrations/20260920000000_add_activation_tracking/migration.sql` (create) | the SQL for those columns |
| `src/lib/activation.ts` (create) | pure stage/template/sort logic |
| `src/lib/activation.test.ts` (create) | unit tests for the above |
| `src/lib/format.ts` (modify) + `src/lib/format.test.ts` (modify) | `relativeTime()` helper |
| `src/app/api/overlay/[username]/route.ts` (modify) | record `overlayLastSeenAt` |
| `src/lib/email.ts` (modify) | `sendActivationNudgeEmail()` |
| `src/app/api/admin/activation-nudge/route.ts` (create) | admin-only POST that claims + sends |
| `src/components/NudgeButton.tsx` (create) | client button (send / test) |
| `src/components/ActivationSection.tsx` (create) | server component: funnel strip + table |
| `src/app/[locale]/admin/page.tsx` (modify) | mount `ActivationSection` at the top |
| `messages/th.json`, `messages/en.json` (modify) | `admin.activation.*` keys |

---

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (model `User`, next to `overlayKey` and near the `createdAt` lines)
- Create: `prisma/migrations/20260920000000_add_activation_tracking/migration.sql`

**Interfaces:**
- Produces: `User.overlayLastSeenAt: Date | null`, `User.activationNudgeSentAt: Date | null` on the Prisma client.

- [ ] **Step 1: Add the columns to the Prisma schema**

In `prisma/schema.prisma`, inside `model User { … }`, directly after the line `overlayKey   String?  @unique`, add:

```prisma
  // Activation tracking (admin-only). Last time the alert overlay polled
  // /api/overlay/[username] with a valid key — written at most once per
  // 5 minutes. Null = never opened (or opened before this column existed).
  overlayLastSeenAt DateTime?
  // When the one-time "you're stuck here" reminder was emailed. Non-null
  // means never send another one, whatever happens.
  activationNudgeSentAt DateTime?
```

- [ ] **Step 2: Write the migration by hand**

Create `prisma/migrations/20260920000000_add_activation_tracking/migration.sql`:

```sql
-- Activation tracking for the admin funnel view.
-- overlayLastSeenAt: last valid poll from the OBS alert overlay (throttled to one write / 5 min).
-- activationNudgeSentAt: the once-ever reminder guard.
ALTER TABLE "User" ADD COLUMN "overlayLastSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "activationNudgeSentAt" TIMESTAMP(3);
```

- [ ] **Step 3: Regenerate the client (reads the schema, not the DB)**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260920000000_add_activation_tracking/migration.sql
git commit -m "Schema: overlayLastSeenAt + activationNudgeSentAt on User

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

**Do NOT run `prisma migrate deploy` yet.** It runs in Task 9 after the founder's go-ahead. Until then the app will fail at runtime on any query that selects the new columns — that is expected; unit tests do not touch the DB.

---

### Task 2: Stage logic (`src/lib/activation.ts`)

**Files:**
- Create: `src/lib/activation.ts`
- Test: `src/lib/activation.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Stage = "NO_PROMPTPAY" | "NO_OVERLAY" | "NO_TIP" | "ACTIVE" | "IDLE";
  export type NudgeTemplate = "NO_PROMPTPAY" | "NO_OVERLAY";
  export const ACTIVE_WINDOW_DAYS = 30;
  export const STAGE_ORDER: readonly Stage[];
  export type StageInput = { promptpayId: string | null; overlayLastSeenAt: Date | null; lastConfirmedTipAt: Date | null };
  export function stage(input: StageInput, now: Date): Stage;
  export function nudgeTemplate(s: Stage): NudgeTemplate | null;
  export type SortableRow = StageInput & { createdAt: Date; stage: Stage };
  export function compareRows(a: SortableRow, b: SortableRow): number;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/activation.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stage,
  nudgeTemplate,
  compareRows,
  ACTIVE_WINDOW_DAYS,
  type SortableRow,
} from "./activation.ts";

const NOW = new Date("2026-09-20T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

test("no PromptPay → NO_PROMPTPAY, regardless of anything else", () => {
  assert.equal(
    stage({ promptpayId: null, overlayLastSeenAt: daysAgo(1), lastConfirmedTipAt: daysAgo(1) }, NOW),
    "NO_PROMPTPAY",
  );
  assert.equal(
    stage({ promptpayId: "", overlayLastSeenAt: null, lastConfirmedTipAt: null }, NOW),
    "NO_PROMPTPAY",
  );
});

test("PromptPay set, overlay never seen, no tip → NO_OVERLAY", () => {
  assert.equal(
    stage({ promptpayId: "0812345678", overlayLastSeenAt: null, lastConfirmedTipAt: null }, NOW),
    "NO_OVERLAY",
  );
});

test("overlay seen, no confirmed tip → NO_TIP", () => {
  assert.equal(
    stage({ promptpayId: "0812345678", overlayLastSeenAt: daysAgo(2), lastConfirmedTipAt: null }, NOW),
    "NO_TIP",
  );
});

test("confirmed tip inside the window → ACTIVE; outside → IDLE; boundary is ACTIVE", () => {
  const base = { promptpayId: "0812345678", overlayLastSeenAt: daysAgo(1) };
  assert.equal(stage({ ...base, lastConfirmedTipAt: daysAgo(29) }, NOW), "ACTIVE");
  assert.equal(stage({ ...base, lastConfirmedTipAt: daysAgo(31) }, NOW), "IDLE");
  assert.equal(stage({ ...base, lastConfirmedTipAt: daysAgo(ACTIVE_WINDOW_DAYS) }, NOW), "ACTIVE");
});

test("tips but overlay never recorded (pre-feature creators) → never NO_OVERLAY", () => {
  const base = { promptpayId: "0812345678", overlayLastSeenAt: null };
  assert.equal(stage({ ...base, lastConfirmedTipAt: daysAgo(3) }, NOW), "ACTIVE");
  assert.equal(stage({ ...base, lastConfirmedTipAt: daysAgo(90) }, NOW), "IDLE");
});

test("nudge template only for the two self-fixable stages", () => {
  assert.equal(nudgeTemplate("NO_PROMPTPAY"), "NO_PROMPTPAY");
  assert.equal(nudgeTemplate("NO_OVERLAY"), "NO_OVERLAY");
  assert.equal(nudgeTemplate("NO_TIP"), null);
  assert.equal(nudgeTemplate("ACTIVE"), null);
  assert.equal(nudgeTemplate("IDLE"), null);
});

test("rows sort by stage, then stuck-longest first", () => {
  const row = (
    s: SortableRow["stage"],
    createdDays: number,
    tipDays: number | null,
  ): SortableRow => ({
    stage: s,
    createdAt: daysAgo(createdDays),
    promptpayId: s === "NO_PROMPTPAY" ? null : "x",
    overlayLastSeenAt: null,
    lastConfirmedTipAt: tipDays === null ? null : daysAgo(tipDays),
  });
  const rows = [
    row("ACTIVE", 100, 1),
    row("NO_TIP", 20, null),
    row("NO_PROMPTPAY", 5, null),
    row("NO_PROMPTPAY", 40, null),
    row("IDLE", 200, 60),
    row("IDLE", 200, 45),
    row("ACTIVE", 100, 10),
    row("NO_OVERLAY", 15, null),
  ];
  const sorted = [...rows].sort(compareRows);
  assert.deepEqual(
    sorted.map((r) => `${r.stage}:${Math.round((NOW.getTime() - r.createdAt.getTime()) / 86_400_000)}:${r.lastConfirmedTipAt ? Math.round((NOW.getTime() - r.lastConfirmedTipAt.getTime()) / 86_400_000) : "-"}`),
    [
      "NO_PROMPTPAY:40:-", // oldest signup first
      "NO_PROMPTPAY:5:-",
      "NO_OVERLAY:15:-",
      "NO_TIP:20:-",
      "IDLE:200:60", // longest silence first
      "IDLE:200:45",
      "ACTIVE:100:1", // most recent tip first
      "ACTIVE:100:10",
    ],
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/activation.test.ts`
Expected: FAIL — `Cannot find module './activation.ts'`.

- [ ] **Step 3: Implement `src/lib/activation.ts`**

```ts
/**
 * Creator activation funnel — pure, no DB, runs under `node --test`.
 *
 * A creator is placed at the FIRST step they have not completed:
 *   NO_PROMPTPAY → NO_OVERLAY → NO_TIP → (ACTIVE | IDLE)
 * except that anyone with a confirmed tip is ACTIVE/IDLE straight away —
 * creators from before `overlayLastSeenAt` existed have tips but no overlay
 * timestamp, and must not look stuck at NO_OVERLAY.
 */

export type Stage = "NO_PROMPTPAY" | "NO_OVERLAY" | "NO_TIP" | "ACTIVE" | "IDLE";

/** Stages that get a one-time reminder — the two the creator can fix alone. */
export type NudgeTemplate = "NO_PROMPTPAY" | "NO_OVERLAY";

/** A confirmed tip within this many days counts as "still active". */
export const ACTIVE_WINDOW_DAYS = 30;

/** Table order: the earliest blockers first, healthy accounts last. */
export const STAGE_ORDER: readonly Stage[] = [
  "NO_PROMPTPAY",
  "NO_OVERLAY",
  "NO_TIP",
  "IDLE",
  "ACTIVE",
];

export type StageInput = {
  promptpayId: string | null;
  overlayLastSeenAt: Date | null;
  /** Most recent CONFIRMED tip, or null if there has never been one. */
  lastConfirmedTipAt: Date | null;
};

export function stage(input: StageInput, now: Date): Stage {
  if (!input.promptpayId) return "NO_PROMPTPAY";
  if (input.lastConfirmedTipAt) {
    const ageMs = now.getTime() - input.lastConfirmedTipAt.getTime();
    return ageMs <= ACTIVE_WINDOW_DAYS * 86_400_000 ? "ACTIVE" : "IDLE";
  }
  if (!input.overlayLastSeenAt) return "NO_OVERLAY";
  return "NO_TIP";
}

export function nudgeTemplate(s: Stage): NudgeTemplate | null {
  return s === "NO_PROMPTPAY" || s === "NO_OVERLAY" ? s : null;
}

export type SortableRow = StageInput & { createdAt: Date; stage: Stage };

/**
 * Sort for the admin table: by stage, then "stuck longest" first — oldest
 * signup for the pre-tip stages, longest silence for IDLE, and for ACTIVE the
 * most recent tip first (they are fine; show the liveliest at the top).
 */
export function compareRows(a: SortableRow, b: SortableRow): number {
  const byStage = STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage);
  if (byStage !== 0) return byStage;
  const aTip = a.lastConfirmedTipAt?.getTime() ?? 0;
  const bTip = b.lastConfirmedTipAt?.getTime() ?? 0;
  if (a.stage === "IDLE") return aTip - bTip; // oldest last tip first
  if (a.stage === "ACTIVE") return bTip - aTip; // newest last tip first
  return a.createdAt.getTime() - b.createdAt.getTime(); // oldest signup first
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/activation.test.ts`
Expected: `ℹ pass 7`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/activation.ts src/lib/activation.test.ts
git commit -m "Activation funnel: pure stage / nudge-template / sort logic

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `relativeTime()` helper

**Files:**
- Modify: `src/lib/format.ts` (append)
- Modify: `src/lib/format.test.ts` (append)

**Interfaces:**
- Produces: `export function relativeTime(date: Date, now: Date, locale: "th" | "en"): string` — "เมื่อสักครู่" / "5 นาทีก่อน" / "3 ชม.ก่อน" / "12 วันก่อน" (en: "just now" / "5 min ago" / "3 h ago" / "12 days ago"). Timezone-independent (pure difference), so safe on the server.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/format.test.ts` (keep the existing import line and add `relativeTime` to it):

```ts
import { formatDate, relativeTime } from "./format.ts";
```

and at the end of the file:

```ts
test("relativeTime buckets minutes / hours / days in both locales", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  assert.equal(relativeTime(ago(20_000), now, "th"), "เมื่อสักครู่");
  assert.equal(relativeTime(ago(5 * 60_000), now, "th"), "5 นาทีก่อน");
  assert.equal(relativeTime(ago(3 * 3_600_000), now, "th"), "3 ชม.ก่อน");
  assert.equal(relativeTime(ago(12 * 86_400_000), now, "th"), "12 วันก่อน");
  assert.equal(relativeTime(ago(20_000), now, "en"), "just now");
  assert.equal(relativeTime(ago(5 * 60_000), now, "en"), "5 min ago");
  assert.equal(relativeTime(ago(3 * 3_600_000), now, "en"), "3 h ago");
  assert.equal(relativeTime(ago(12 * 86_400_000), now, "en"), "12 days ago");
  // A clock slightly ahead of "now" is still "just now", never negative.
  assert.equal(relativeTime(new Date(now.getTime() + 5_000), now, "en"), "just now");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test src/lib/format.test.ts`
Expected: FAIL — `relativeTime` is not exported / not a function.

- [ ] **Step 3: Implement**

Append to `src/lib/format.ts`:

```ts
/**
 * Coarse "x ago" for admin tables. Pure difference → identical on server and
 * client, so it can be rendered in a server component without hydration
 * drift. Anything under a minute (or in the future) is "just now".
 */
export function relativeTime(
  date: Date,
  now: Date,
  locale: "th" | "en",
): string {
  const ms = Math.max(0, now.getTime() - date.getTime());
  const min = Math.floor(ms / 60_000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (locale === "th") {
    if (min < 1) return "เมื่อสักครู่";
    if (hr < 1) return `${min} นาทีก่อน`;
    if (day < 1) return `${hr} ชม.ก่อน`;
    return `${day} วันก่อน`;
  }
  if (min < 1) return "just now";
  if (hr < 1) return `${min} min ago`;
  if (day < 1) return `${hr} h ago`;
  return `${day} day${day === 1 ? "" : "s"} ago`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/format.test.ts`
Expected: `ℹ pass 2`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "format: relativeTime() for server-rendered admin tables

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Record `overlayLastSeenAt` from the overlay poll

**Files:**
- Modify: `src/app/api/overlay/[username]/route.ts`

**Interfaces:**
- Consumes: `User.overlayLastSeenAt` (Task 1).
- Produces: the column is populated whenever a valid-key poll arrives and the stored value is null or older than 5 minutes.

- [ ] **Step 1: Import `after`**

Change the first line of the file from

```ts
import { NextResponse } from "next/server";
```

to

```ts
import { NextResponse, after } from "next/server";
```

- [ ] **Step 2: Add the column to the existing select**

In the `prisma.user.findUnique({ … select: { … } })` at the top of `GET`, add one line after `overlayKey: true,`:

```ts
      overlayLastSeenAt: true,
```

- [ ] **Step 3: Throttled, non-blocking write right after the key check**

Directly after the block

```ts
  if (!user?.overlayKey || user.overlayKey !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
```

insert:

```ts
  // Activation tracking: note that this overlay is really being polled (OBS
  // or a browser tab), for the admin funnel. The value we just read decides
  // whether to touch the DB at all, so the usual poll costs no extra query;
  // the WHERE repeats the check so two OBS instances can't both write.
  const OVERLAY_SEEN_STALE_MS = 5 * 60_000;
  const staleBefore = new Date(Date.now() - OVERLAY_SEEN_STALE_MS);
  if (!user.overlayLastSeenAt || user.overlayLastSeenAt < staleBefore) {
    const userId = user.id;
    after(async () => {
      try {
        await prisma.user.updateMany({
          where: {
            id: userId,
            OR: [
              { overlayLastSeenAt: null },
              { overlayLastSeenAt: { lt: staleBefore } },
            ],
          },
          data: { overlayLastSeenAt: new Date() },
        });
      } catch (err) {
        console.error("[overlay] overlayLastSeenAt update failed:", err);
      }
    });
  }
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint "src/app/api/overlay/[username]/route.ts"`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/overlay/[username]/route.ts"
git commit -m "Overlay poll records overlayLastSeenAt (throttled, off the response path)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Nudge email copy

**Files:**
- Modify: `src/lib/email.ts` (append)

**Interfaces:**
- Consumes: private `sendEmail()` and `esc()` already in the file.
- Produces:
  ```ts
  export async function sendActivationNudgeEmail(opts: {
    to: string;
    displayName: string;
    template: "NO_PROMPTPAY" | "NO_OVERLAY";
  }): Promise<void>;
  ```

- [ ] **Step 1: Append the function**

At the end of `src/lib/email.ts`:

```ts
/**
 * One-time "you're stuck here" reminder, sent by the admin from the
 * activation table. Thai only (creators are Thai), one call to action, and
 * an explicit invitation to reply — the reply is the point.
 */
export async function sendActivationNudgeEmail(opts: {
  to: string;
  displayName: string;
  template: "NO_PROMPTPAY" | "NO_OVERLAY";
}): Promise<void> {
  const { to, displayName, template } = opts;
  const name = displayName.trim() || "ครีเอเตอร์";
  const subject = "ติดตรงไหนบอกเราได้นะ — TipTang";

  const body =
    template === "NO_PROMPTPAY"
      ? {
          intro: `สวัสดี ${name} เห็นว่าสมัคร TipTang ไว้แล้ว แต่ยังไม่ได้ใส่พร้อมเพย์ — ใส่แค่เบอร์โทรหรือเลขบัตรเดียว ก็รับทิปเข้าบัญชีตรงได้เลย`,
          cta: "ไปหน้าตั้งค่า",
          url: "https://tiptang.com/th/dashboard/settings",
        }
      : {
          intro: `สวัสดี ${name} พร้อมเพย์เรียบร้อยแล้ว เหลือแค่เอา URL overlay ไปใส่ใน OBS ใช้เวลาแค่ 1 นาที แล้วทิปจะเด้งบนจอไลฟ์ได้เลย`,
          cta: "ดูวิธีตั้ง OBS",
          url: "https://tiptang.com/th/dashboard/overlay",
        };
  const outro = "ถ้าติดตรงไหน ตอบเมลนี้บอกได้เลย เราอ่านทุกฉบับ";

  await sendEmail({
    to,
    subject,
    text: `${body.intro}\n\n${body.cta}: ${body.url}\n\n${outro}`,
    html: `<p>${esc(body.intro)}</p><p><a href="${body.url}">${esc(body.cta)}</a></p><p>${esc(outro)}</p>`,
    devLabel: `Activation nudge (${template})`,
  });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/lib/email.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "Email: one-time activation nudge (no PromptPay / overlay never opened)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `POST /api/admin/activation-nudge`

**Files:**
- Create: `src/app/api/admin/activation-nudge/route.ts`

**Interfaces:**
- Consumes: `requireAdmin()` from `@/lib/admin`, `isAdminEmail()` from `@/lib/admin`, `stage()`/`nudgeTemplate()` (Task 2), `sendActivationNudgeEmail()` (Task 5), `User.activationNudgeSentAt` (Task 1).
- Produces: JSON responses — `200 { sentAt }`, `200 { test: true }`, `400 { error: "invalid" | "not_applicable" }`, `401 { error: "unauthorized" }`, `403 { error: "forbidden" }`, `404 { error: "not_found" }`, `409 { error: "already_sent", sentAt }`, `502 { error: "send_failed" }`.

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isAdminEmail } from "@/lib/admin";
import { stage, nudgeTemplate } from "@/lib/activation";
import { sendActivationNudgeEmail } from "@/lib/email";

// Admin-only. Sends the ONE reminder a creator can ever get, for the stage
// they are stuck at. The guard column is claimed before the email goes out,
// so a double click, two tabs, or a retry can never produce two emails; if
// sending fails we release the claim and report it — "not sent" is the
// failure mode we accept, "sent twice" is not.
const bodySchema = z.object({
  userId: z.string().min(1),
  // Preview mode: only for the admin's own account, never claims the guard.
  test: z.boolean().optional(),
  template: z.enum(["NO_PROMPTPAY", "NO_OVERLAY"]).optional(),
});

export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { userId, test, template: requested } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      promptpayId: true,
      overlayLastSeenAt: true,
      activationNudgeSentAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (test) {
    // Preview both templates on the founder's own inbox, nothing recorded.
    if (!isAdminEmail(user.email) || !requested) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    try {
      await sendActivationNudgeEmail({
        to: user.email,
        displayName: user.displayName,
        template: requested,
      });
    } catch (err) {
      console.error("[activation-nudge] test send failed:", err);
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }
    return NextResponse.json({ test: true });
  }

  const lastTip = await prisma.tip.findFirst({
    where: { creatorId: user.id, status: "CONFIRMED" },
    orderBy: { confirmedAt: "desc" },
    select: { confirmedAt: true },
  });
  const template = nudgeTemplate(
    stage(
      {
        promptpayId: user.promptpayId,
        overlayLastSeenAt: user.overlayLastSeenAt,
        lastConfirmedTipAt: lastTip?.confirmedAt ?? null,
      },
      new Date(),
    ),
  );
  if (!template) {
    return NextResponse.json({ error: "not_applicable" }, { status: 400 });
  }
  if (user.activationNudgeSentAt) {
    return NextResponse.json(
      { error: "already_sent", sentAt: user.activationNudgeSentAt.toISOString() },
      { status: 409 },
    );
  }

  // Claim first. count === 0 means another request won the race.
  const sentAt = new Date();
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, activationNudgeSentAt: null },
    data: { activationNudgeSentAt: sentAt },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "already_sent" }, { status: 409 });
  }

  try {
    await sendActivationNudgeEmail({
      to: user.email,
      displayName: user.displayName,
      template,
    });
  } catch (err) {
    console.error("[activation-nudge] send failed, releasing claim:", err);
    await prisma.user.update({
      where: { id: user.id },
      data: { activationNudgeSentAt: null },
    });
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ sentAt: sentAt.toISOString() });
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/app/api/admin/activation-nudge/route.ts`
Expected: no errors. (`zod` is already a dependency — `src/lib/validators.ts` imports it the same way.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/activation-nudge/route.ts
git commit -m "API: admin activation nudge — claim guard column, then send once

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: `NudgeButton` client component

**Files:**
- Create: `src/components/NudgeButton.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/activation-nudge` (Task 6), i18n keys `admin.activation.*` (added in Task 8 — the component only references them; the page will not render until Task 8 lands).
- Produces:
  ```tsx
  export function NudgeButton(props: {
    userId: string;
    sentAt: string | null;      // ISO, pre-formatted label comes from `sentLabel`
    sentLabel: string | null;   // server-formatted "ส่งแล้ว 20 ก.ย." or null
    mode: "send" | "test";
    template?: "NO_PROMPTPAY" | "NO_OVERLAY"; // required when mode === "test"
  }): JSX.Element
  ```

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

type Template = "NO_PROMPTPAY" | "NO_OVERLAY";

/**
 * "ส่งเตือน" for a stuck creator (once, ever) or "ทดสอบ" on the admin's own
 * row (preview a template, records nothing). The sent state is derived from
 * the server-provided `sentLabel`, so a refresh shows the truth, not local
 * state; after a successful send we refresh the page for the same reason.
 */
export function NudgeButton({
  userId,
  sentLabel,
  mode,
  template,
}: {
  userId: string;
  sentAt: string | null;
  sentLabel: string | null;
  mode: "send" | "test";
  template?: Template;
}) {
  const t = useTranslations("admin.activation");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (mode === "send" && sentLabel) {
    return <span className="text-xs text-brand-900/50">{sentLabel}</span>;
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/activation-nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "test" ? { userId, test: true, template } : { userId },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setDone(true);
        if (mode === "send") router.refresh();
        return;
      }
      if (data.error === "already_sent") {
        router.refresh();
        return;
      }
      setError(t(data.error === "send_failed" ? "sendFailed" : "sendError"));
    } catch {
      setError(t("sendError"));
    } finally {
      setBusy(false);
    }
  }

  const label =
    mode === "test"
      ? done
        ? t("testSent")
        : t(template === "NO_PROMPTPAY" ? "testNoPromptpay" : "testNoOverlay")
      : done
        ? t("sending")
        : t("send");

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={send}
        disabled={busy || (mode === "send" && done)}
        className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? t("sending") : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/NudgeButton.tsx`
Expected: no errors (the `sentAt` prop is accepted but unused on purpose — it is destructured away in the parameter list, so no lint warning).

Note: the `sentAt` prop is intentionally not destructured — TypeScript accepts extra declared props. If ESLint complains about an unused prop, remove `sentAt` from the type and from the call site in Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/components/NudgeButton.tsx
git commit -m "NudgeButton: send-once / preview button for the activation table

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Activation section on `/admin` + i18n

**Files:**
- Create: `src/components/ActivationSection.tsx` (server component)
- Modify: `src/app/[locale]/admin/page.tsx`
- Modify: `messages/th.json`, `messages/en.json`

**Interfaces:**
- Consumes: Tasks 1–3, 7; `isAdminEmail`, `formatBaht`, `formatDate`, `relativeTime`, `Icon`.
- Produces: `export async function ActivationSection({ locale }: { locale: string }): Promise<JSX.Element>`.

- [ ] **Step 1: Add i18n keys**

In `messages/th.json`, inside the `"admin": { … }` object, add after `"statusRejected": "ปฏิเสธแล้ว"` (add a trailing comma to that line):

```json
    "activation": {
      "title": "Activation — ครีเอเตอร์ติดอยู่ขั้นไหน",
      "hint": "ไม่นับบัญชีแอดมิน · overlay เริ่มเก็บข้อมูลตั้งแต่ 20 ก.ย. 2569 — ก่อนหน้านั้นขึ้น \"ไม่มีข้อมูล\"",
      "stage_NO_PROMPTPAY": "ยังไม่ใส่พร้อมเพย์",
      "stage_NO_OVERLAY": "ยังไม่เปิด overlay",
      "stage_NO_TIP": "ยังไม่มีทิป",
      "stage_ACTIVE": "ใช้งานอยู่ (30 วัน)",
      "stage_IDLE": "หายไป",
      "colCreator": "ครีเอเตอร์",
      "colSignup": "สมัคร",
      "colPromptpay": "พร้อมเพย์",
      "colOverlay": "overlay ล่าสุด",
      "colTips": "ทิป",
      "colLastTip": "ทิปล่าสุด",
      "colStage": "สถานะ",
      "colNudge": "เตือน",
      "never": "ยังไม่เคย",
      "noData": "ไม่มีข้อมูล",
      "send": "ส่งเตือน",
      "sending": "กำลังส่ง…",
      "sentOn": "ส่งแล้ว {date}",
      "sendError": "ส่งไม่สำเร็จ ลองใหม่",
      "sendFailed": "อีเมลส่งไม่ออก (ยังไม่ถูกนับว่าส่งแล้ว)",
      "testNoPromptpay": "ทดสอบ: พร้อมเพย์",
      "testNoOverlay": "ทดสอบ: overlay",
      "testSent": "ส่งเข้าเมลคุณแล้ว"
    }
```

In `messages/en.json`, same place:

```json
    "activation": {
      "title": "Activation — where each creator is stuck",
      "hint": "Admin account excluded · overlay tracking started 20 Sep 2026 — earlier rows show \"no data\"",
      "stage_NO_PROMPTPAY": "No PromptPay yet",
      "stage_NO_OVERLAY": "Overlay never opened",
      "stage_NO_TIP": "No tips yet",
      "stage_ACTIVE": "Active (30 days)",
      "stage_IDLE": "Gone quiet",
      "colCreator": "Creator",
      "colSignup": "Signed up",
      "colPromptpay": "PromptPay",
      "colOverlay": "Overlay last seen",
      "colTips": "Tips",
      "colLastTip": "Last tip",
      "colStage": "Stage",
      "colNudge": "Nudge",
      "never": "never",
      "noData": "no data",
      "send": "Send reminder",
      "sending": "Sending…",
      "sentOn": "Sent {date}",
      "sendError": "Failed, try again",
      "sendFailed": "Email did not go out (not counted as sent)",
      "testNoPromptpay": "Test: PromptPay",
      "testNoOverlay": "Test: overlay",
      "testSent": "Sent to your inbox"
    }
```

Validate both files: `node -e "JSON.parse(require('fs').readFileSync('messages/th.json','utf8')); JSON.parse(require('fs').readFileSync('messages/en.json','utf8')); console.log('json ok')"`.

- [ ] **Step 2: Create `src/components/ActivationSection.tsx`**

```tsx
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/admin";
import {
  stage,
  nudgeTemplate,
  compareRows,
  STAGE_ORDER,
  type Stage,
} from "@/lib/activation";
import { formatBaht, formatDate, relativeTime } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { NudgeButton } from "@/components/NudgeButton";

const BADGE: Record<Stage, string> = {
  NO_PROMPTPAY: "bg-brand-100 text-brand-900/60",
  NO_OVERLAY: "bg-yellow-100 text-yellow-800",
  NO_TIP: "bg-orange-100 text-orange-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  IDLE: "bg-red-100 text-red-700",
};

/**
 * Server component: the activation funnel + one row per creator, sorted so
 * the people worth talking to are at the top. All times are formatted here
 * against a single `now`, so nothing drifts on hydration.
 */
export async function ActivationSection({ locale }: { locale: string }) {
  const t = await getTranslations("admin.activation");
  const lang: "th" | "en" = locale === "th" ? "th" : "en";
  const dateLocale = lang === "th" ? "th-TH" : "en-US";
  const now = new Date();

  const [users, tipAgg] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        createdAt: true,
        promptpayId: true,
        overlayLastSeenAt: true,
        activationNudgeSentAt: true,
      },
    }),
    // One query for every creator's confirmed-tip count / sum / latest.
    prisma.tip.groupBy({
      by: ["creatorId"],
      where: { status: "CONFIRMED" },
      _count: { _all: true },
      _sum: { amount: true },
      _max: { confirmedAt: true },
    }),
  ]);
  const agg = new Map(tipAgg.map((a) => [a.creatorId, a]));

  const rows = users
    .map((u) => {
      const a = agg.get(u.id);
      const lastConfirmedTipAt = a?._max.confirmedAt ?? null;
      const input = {
        promptpayId: u.promptpayId,
        overlayLastSeenAt: u.overlayLastSeenAt,
        lastConfirmedTipAt,
      };
      return {
        ...u,
        ...input,
        stage: stage(input, now),
        tipCount: a?._count._all ?? 0,
        tipSum: Number(a?._sum.amount ?? 0),
        isAdmin: isAdminEmail(u.email),
      };
    })
    .sort(compareRows);

  const counted = rows.filter((r) => !r.isAdmin);
  const funnel = STAGE_ORDER.map((s) => ({
    stage: s,
    n: counted.filter((r) => r.stage === s).length,
  }));

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-brand-900">
        <Icon name="zap" className="h-5 w-5" />
        {t("title")}
      </h2>
      <p className="mb-4 text-xs text-brand-900/55">{t("hint")}</p>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {funnel.map((f) => (
          <div key={f.stage} className="card rounded-2xl px-3 py-2">
            <p className="text-2xl font-extrabold tabular-nums text-brand-900">{f.n}</p>
            <p className="text-xs text-brand-900/60">{t(`stage_${f.stage}`)}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[840px] text-sm">
          <thead className="text-left text-xs text-brand-900/55">
            <tr>
              <th className="px-3 py-2">{t("colCreator")}</th>
              <th className="px-3 py-2">{t("colSignup")}</th>
              <th className="px-3 py-2">{t("colPromptpay")}</th>
              <th className="px-3 py-2">{t("colOverlay")}</th>
              <th className="px-3 py-2">{t("colTips")}</th>
              <th className="px-3 py-2">{t("colLastTip")}</th>
              <th className="px-3 py-2">{t("colStage")}</th>
              <th className="px-3 py-2">{t("colNudge")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const overlayLabel = r.overlayLastSeenAt
                ? relativeTime(r.overlayLastSeenAt, now, lang)
                : r.tipCount > 0
                  ? t("noData")
                  : t("never");
              const sentLabel = r.activationNudgeSentAt
                ? t("sentOn", { date: formatDate(r.activationNudgeSentAt, dateLocale) })
                : null;
              const template = nudgeTemplate(r.stage);
              return (
                <tr key={r.id} className="border-t border-brand-900/10 align-top">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-brand-900">{r.displayName}</div>
                    <a
                      href={`/${locale}/${r.username}`}
                      className="text-xs text-brand-700 hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      @{r.username}
                    </a>
                    <div className="text-xs text-brand-900/50">{r.email}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {relativeTime(r.createdAt, now, lang)}
                  </td>
                  <td className="px-3 py-2">{r.promptpayId ? "✓" : "✗"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{overlayLabel}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.tipCount}
                    {r.tipCount > 0 && (
                      <span className="text-brand-900/50"> ({formatBaht(r.tipSum, dateLocale)})</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.lastConfirmedTipAt ? relativeTime(r.lastConfirmedTipAt, now, lang) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[r.stage]}`}>
                      {t(`stage_${r.stage}`)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.isAdmin ? (
                      <span className="inline-flex flex-wrap gap-1">
                        <NudgeButton userId={r.id} sentAt={null} sentLabel={null} mode="test" template="NO_PROMPTPAY" />
                        <NudgeButton userId={r.id} sentAt={null} sentLabel={null} mode="test" template="NO_OVERLAY" />
                      </span>
                    ) : template ? (
                      <NudgeButton
                        userId={r.id}
                        sentAt={r.activationNudgeSentAt?.toISOString() ?? null}
                        sentLabel={sentLabel}
                        mode="send"
                      />
                    ) : (
                      <span className="text-brand-900/40">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Mount it on the admin page**

In `src/app/[locale]/admin/page.tsx`:

1. Add the import after `import { ReportAdminRow } from "@/components/ReportAdminRow";`:

```ts
import { ActivationSection } from "@/components/ActivationSection";
```

2. Directly after the line

```tsx
      <h1 className="text-2xl font-extrabold text-brand-900">{t("title")}</h1>
```

insert:

```tsx
      <ActivationSection locale={locale} />
```

- [ ] **Step 4: Typecheck, lint, tests, build**

Run:
```bash
npx tsc --noEmit && npx eslint src messages 2>&1 | tail -1 && npm test 2>&1 | grep -E "^ℹ (pass|fail)" && npm run build 2>&1 | grep -E "✓ Compiled|Error" | head -3
```
Expected: tsc clean; `✖ 5 problems (5 errors, 0 warnings)` (the pre-existing ones, unchanged); `pass` count = previous 21 + 8 new = 29, `fail 0`; `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ActivationSection.tsx "src/app/[locale]/admin/page.tsx" messages/th.json messages/en.json
git commit -m "Admin: activation funnel + per-creator table with one-time nudge

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Deploy the migration and verify on localhost

**Files:** none (verification only)

- [ ] **Step 1: Ask the founder for the go-ahead to run the migration**

Say exactly what will run: `npx prisma migrate deploy` adds two nullable columns to `"User"` on the production database (no data change, no downtime). Wait for an explicit yes.

- [ ] **Step 2: Deploy + regenerate**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: `1 migration found … Applied migration 20260920000000_add_activation_tracking`.

- [ ] **Step 3: Start the dev server and open the admin page**

Use `preview_start` with name `tiptang-dev`; the founder logs in on `http://localhost:3000/th/login` in the Browser pane (Google or password — never type credentials yourself). Then open `http://localhost:3000/th/admin`.

Check (via `read_page` / JS in the pane):
- 18 rows; funnel tiles add up to 17 (admin excluded); the admin's own row shows two "ทดสอบ" buttons and is at the top of ACTIVE.
- Every non-admin row has "✗"/"✓" for PromptPay and "ยังไม่เคย" or "ไม่มีข้อมูล" in the overlay column (nothing has polled yet).
- No console errors on the page (`read_console_messages`, `onlyErrors: true`).

- [ ] **Step 4: Verify the throttled overlay write**

In a second pane tab open `http://localhost:3000/overlay/lig_1569?key=<the founder's overlay key, copied from /th/dashboard/overlay — never paste it into chat>`. Wait ~5 s (one poll), then refresh `/th/admin`: the admin row's overlay column reads "เมื่อสักครู่". Note the exact value via a tiny read-only script:

```bash
node --env-file=.env -e "import('@prisma/client').then(async ({PrismaClient})=>{const {PrismaPg}=await import('@prisma/adapter-pg');const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});const u=await p.user.findUnique({where:{username:'lig_1569'},select:{overlayLastSeenAt:true}});console.log(u);await p.\$disconnect();})"
```

Keep the overlay tab open 2 more minutes, re-run: the timestamp must be **unchanged**. Then check a wrong key returns 403: `fetch('/api/overlay/lig_1569?key=nope')` → 403, and the timestamp is still unchanged.

- [ ] **Step 5: Preview both emails**

On the admin row click "ทดสอบ: พร้อมเพย์" then "ทดสอบ: overlay". Both arrive at the founder's inbox from `TipTang <support@tiptang.com>` with subject "ติดตรงไหนบอกเราได้นะ — TipTang", one link each. Re-run the script from Step 4 with `select:{activationNudgeSentAt:true}` — must still be `null`.

- [ ] **Step 6: Negative API checks (no real send)**

From the admin tab's console:
```js
// a creator who is ACTIVE/IDLE → not_applicable, nothing recorded
await (await fetch('/api/admin/activation-nudge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'<an ACTIVE creator id from the table DOM>'})})).json()
// garbage body → 400 invalid
await (await fetch('/api/admin/activation-nudge',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json()
```
And from a logged-out tab: the same POST → 401.

**Do not press "ส่งเตือน" on any real creator during verification.**

- [ ] **Step 7: Hand back to the founder**

Report the results with the exact numbers seen, leave the dev server running for their own look, and wait for "merge push". Merge is `git checkout main && git merge --ff-only feat/admin-activation`, push is `GIT_SSH_COMMAND="ssh -o BatchMode=yes" git push origin main`.

---

## Self-review

**Spec coverage:** §1 data → Task 1 + Task 4 · §2 stage logic → Task 2 · §3 admin page (funnel, table, sort, badges, server-side relative time, admin excluded from counts, horizontal scroll, i18n) → Tasks 3 + 8 · §4 nudge (API rules, claim-then-send, test mode, button states, email copy) → Tasks 5, 6, 7 · §5 testing → Tasks 2/3 unit tests + Task 9 manual · §6 rollout → Task 9 · "not in scope" respected (no cron, no NO_TIP email, no lastLoginAt).

**Placeholder scan:** none — every code step is complete. The overlay key in Task 9 is deliberately described, not written.

**Type consistency:** `stage(input, now)` / `nudgeTemplate(stage)` / `compareRows(a, b)` / `STAGE_ORDER` / `ACTIVE_WINDOW_DAYS` match between Task 2 and Tasks 6, 8. `relativeTime(date, now, "th" | "en")` matches Task 3 and Task 8. `sendActivationNudgeEmail({ to, displayName, template })` matches Task 5 and Task 6. `NudgeButton` props (`userId, sentAt, sentLabel, mode, template`) match Task 7 and Task 8. i18n keys used in Tasks 7/8 (`send, sending, sentOn, sendError, sendFailed, testNoPromptpay, testNoOverlay, testSent, stage_*, col*, never, noData, title, hint`) all exist in Task 8 step 1.
