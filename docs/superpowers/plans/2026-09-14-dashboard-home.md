# Dashboard Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/[locale]/dashboard` around a time-range overview (today / 7d / 30d / all), an auto-detected onboarding checklist, and move the OBS overlay settings to their own page `/[locale]/dashboard/overlay`.

**Architecture:** The dashboard stays a server component; the selected range lives in `?range=` and is parsed by pure functions in `src/lib/range.ts` (Bangkok-day arithmetic, unit-tested with `node --test`). The leaderboard SQL currently inlined in the donate page moves to `src/lib/leaderboard.ts` so the dashboard can ask for "top supporter since X" with the same normalisation. The ~1000-line `<OverlaySettings/>` client component is left untouched and simply rendered from the new route.

**Tech Stack:** Next.js 16 App Router (server components, `searchParams` Promise), Prisma 7 (`$queryRaw` + `Prisma.sql`/`Prisma.empty` fragments), next-intl, Tailwind v4, Node 26 built-in `node:test` (types strip natively — no runner dependency).

Spec: `docs/superpowers/specs/2026-09-14-dashboard-home-design.md`

## Global Constraints

- No DB schema change, no new dependency, no new API route.
- Do NOT modify `src/components/OverlaySettings.tsx`, `TipRow.tsx`, `ReportForm.tsx`, or the settings page.
- Dashboard page stays a server component — no new `"use client"` file for the home page.
- "Today" and chart day boundaries are **Asia/Bangkok** regardless of server TZ (Vercel = UTC).
- Range filter uses `createdAt` (not `confirmedAt`), status `CONFIRMED`.
- Unknown `?range=` → `7d`.
- `npm run lint` must stay at exactly **5** pre-existing `react-hooks/set-state-in-effect` errors.
- Donate-page leaderboard numbers must be **identical** before and after the SQL extraction.
- Never edit real user rows in the production DB to test; verify onboarding states by rendering the component with props.
- Section headings use the donate-page style: `text-xs font-semibold uppercase tracking-wide text-brand-900/60` + `<Icon>`.
- Prisma tagged templates: regex escapes need **double** backslashes (`'\\u200B'`). When writing files with the Write tool this is literal; do not "fix" them to single.
- Bash heredocs in this environment break on `'` — write source files with the Write tool.
- After `npm run build`, `rm -rf .next` before restarting the dev server (stale build breaks dynamic API routes + Tailwind scanning).
- Work on a new branch `dashboard-home` off `main` (`da1ca3b`). Do not push; the user tests locally first.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/range.ts` (new) | Pure range helpers: parse `?range`, Bangkok day start/key, range start, day buckets, sum-by-day |
| `src/lib/range.test.ts` (new) | `node:test` unit tests for the above |
| `tsconfig.json` (modify) | `allowImportingTsExtensions: true` so the test can import `./range.ts` (Node needs the extension; `noEmit` is already on) |
| `package.json` (modify) | `"test": "node --test \"src/**/*.test.ts\""` |
| `src/lib/leaderboard.ts` (new) | `topSupporters(creatorId, { limit, publicOnly, since })` — the normalised-name SQL, moved verbatim from the donate page |
| `src/app/[locale]/[username]/page.tsx` (modify) | Replace inline `$queryRaw` with `topSupporters(...)`; remove the now-unused post-processing |
| `messages/th.json`, `messages/en.json` (modify) | Add new `dashboard.*` keys; delete `totalReceived`, `tipsCount`, `pendingCount`, `setupPromptpayWarning` |
| `src/components/OnboardingChecklist.tsx` (new) | Server component; 3 auto-detected steps; returns null when all done |
| `src/app/[locale]/dashboard/overlay/page.tsx` (new) | Auth-gated page that renders `<OverlaySettings/>` + back link |
| `src/app/[locale]/dashboard/page.tsx` (rewrite) | Header pills · checklist · overview (tabs, 3 numbers, chart) · pending line · profile link row · tips (`id="tips"`) · ReportForm |

---

### Task 0: Branch

- [ ] **Step 1: Create the branch**

```bash
git checkout -b dashboard-home main
```

- [ ] **Step 2: Commit the spec**

```bash
git add docs/superpowers/specs/2026-09-14-dashboard-home-design.md docs/superpowers/plans/2026-09-14-dashboard-home.md
git commit -m "Add spec + plan: dashboard home (range overview, onboarding, overlay page)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 1: Range helpers (`src/lib/range.ts`) — TDD

**Files:**
- Create: `src/lib/range.ts`
- Create: `src/lib/range.test.ts`
- Modify: `tsconfig.json` (add `"allowImportingTsExtensions": true` under `compilerOptions`)
- Modify: `package.json` (add `"test"` script)

**Interfaces:**
- Produces:
  ```ts
  export type Range = "today" | "7d" | "30d" | "all";
  export type ChartRange = "7d" | "30d";
  export const RANGES: readonly Range[];
  export const DEFAULT_RANGE: Range;                       // "7d"
  export function parseRange(raw: string | string[] | undefined): Range;
  export function hasChart(range: Range): range is ChartRange;
  export function bangkokDayKey(d: Date): string;          // "YYYY-MM-DD" in Asia/Bangkok
  export function bangkokDayStart(d: Date): Date;          // 00:00 Bangkok of that day, as a UTC instant
  export function rangeStart(range: Range, now: Date): Date | null;   // "all" → null
  export function dayBuckets(range: ChartRange, now: Date): string[]; // keys oldest → newest, length 7 or 30
  export function sumByDay(keys: string[], rows: { day: string; amount: number }[]): { key: string; amount: number; pct: number }[];
  ```

- [ ] **Step 1: Enable `.ts` imports and add the test script**

In `tsconfig.json`, inside `compilerOptions`, add after `"noEmit": true,`:

```json
    "allowImportingTsExtensions": true,
```

In `package.json` `scripts`, add after `"lint": "eslint",`:

```json
    "test": "node --test \"src/**/*.test.ts\"",
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/range.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bangkokDayKey,
  bangkokDayStart,
  dayBuckets,
  parseRange,
  rangeStart,
  sumByDay,
} from "./range.ts";

// 2026-09-14 20:30 UTC = 2026-09-15 03:30 Bangkok. Every "today" question
// below must answer 15 Sep, never 14 — that is the whole point of the module.
const lateUtc = new Date("2026-09-14T20:30:00Z");

test("parseRange accepts the four ranges and falls back to 7d", () => {
  assert.equal(parseRange("today"), "today");
  assert.equal(parseRange("30d"), "30d");
  assert.equal(parseRange("all"), "all");
  assert.equal(parseRange("xyz"), "7d");
  assert.equal(parseRange(undefined), "7d");
  assert.equal(parseRange(["30d", "today"]), "30d");
});

test("bangkokDayKey uses the Bangkok calendar day", () => {
  assert.equal(bangkokDayKey(lateUtc), "2026-09-15");
  assert.equal(bangkokDayKey(new Date("2026-09-14T16:59:59Z")), "2026-09-14");
  assert.equal(bangkokDayKey(new Date("2026-09-14T17:00:00Z")), "2026-09-15");
});

test("bangkokDayStart is 17:00 UTC of the previous UTC day", () => {
  assert.equal(bangkokDayStart(lateUtc).toISOString(), "2026-09-14T17:00:00.000Z");
  assert.equal(
    bangkokDayStart(new Date("2026-09-14T02:00:00Z")).toISOString(),
    "2026-09-13T17:00:00.000Z",
  );
});

test("rangeStart counts calendar days including today", () => {
  assert.equal(rangeStart("today", lateUtc)?.toISOString(), "2026-09-14T17:00:00.000Z");
  assert.equal(rangeStart("7d", lateUtc)?.toISOString(), "2026-09-08T17:00:00.000Z");
  assert.equal(rangeStart("30d", lateUtc)?.toISOString(), "2026-08-16T17:00:00.000Z");
  assert.equal(rangeStart("all", lateUtc), null);
});

test("dayBuckets lists every day oldest → newest, ending today (Bangkok)", () => {
  const seven = dayBuckets("7d", lateUtc);
  assert.equal(seven.length, 7);
  assert.equal(seven[0], "2026-09-09");
  assert.equal(seven[6], "2026-09-15");
  const thirty = dayBuckets("30d", lateUtc);
  assert.equal(thirty.length, 30);
  assert.equal(thirty[0], "2026-08-17");
  assert.equal(thirty[29], "2026-09-15");
});

test("sumByDay totals per key, ignores rows outside the keys, scales to the max", () => {
  const out = sumByDay(
    ["2026-09-13", "2026-09-14", "2026-09-15"],
    [
      { day: "2026-09-14", amount: 50 },
      { day: "2026-09-14", amount: 150 },
      { day: "2026-09-15", amount: 100 },
      { day: "2026-09-01", amount: 999 },
    ],
  );
  assert.deepEqual(out, [
    { key: "2026-09-13", amount: 0, pct: 0 },
    { key: "2026-09-14", amount: 200, pct: 100 },
    { key: "2026-09-15", amount: 100, pct: 50 },
  ]);
});

test("sumByDay with no tips gives all-zero bars (no division by zero)", () => {
  assert.deepEqual(sumByDay(["2026-09-15"], []), [
    { key: "2026-09-15", amount: 0, pct: 0 },
  ]);
});
```

- [ ] **Step 3: Run the tests — expect failure (module missing)**

```bash
npm test
```

Expected: fails with `Cannot find module '.../src/lib/range.ts'`.

- [ ] **Step 4: Implement `src/lib/range.ts`**

```ts
/**
 * Time-range helpers for the dashboard overview. Pure functions, no DB,
 * no "server-only" import — so they can run under `node --test`.
 *
 * All calendar arithmetic is done in Asia/Bangkok (UTC+7, no DST). Vercel
 * runs in UTC, so "today" must NOT come from `new Date().setHours(0)` — a
 * tip at 8 pm Thai time would otherwise land on tomorrow.
 */

export type Range = "today" | "7d" | "30d" | "all";
export type ChartRange = "7d" | "30d";

export const RANGES: readonly Range[] = ["today", "7d", "30d", "all"];
export const DEFAULT_RANGE: Range = "7d";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// en-CA formats as YYYY-MM-DD, which is exactly the bucket key we want.
const bangkokDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `?range=` from the URL → a known Range. Anything else is the default. */
export function parseRange(raw: string | string[] | undefined): Range {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (RANGES as readonly string[]).includes(value ?? "")
    ? (value as Range)
    : DEFAULT_RANGE;
}

/** Only multi-day ranges get a daily bar chart. */
export function hasChart(range: Range): range is ChartRange {
  return range === "7d" || range === "30d";
}

/** "YYYY-MM-DD" of the instant, in Bangkok. */
export function bangkokDayKey(d: Date): string {
  return bangkokDayFormat.format(d);
}

/** 00:00 Bangkok on the same Bangkok day as `d`, as a UTC instant. */
export function bangkokDayStart(d: Date): Date {
  const [y, m, day] = bangkokDayKey(d).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day) - BANGKOK_OFFSET_MS);
}

function rangeDays(range: ChartRange | "today"): number {
  return range === "today" ? 1 : range === "7d" ? 7 : 30;
}

/**
 * Earliest instant that belongs to the range, or null for "all".
 * "7d" means today plus the 6 previous calendar days — 7 bars on the chart.
 */
export function rangeStart(range: Range, now: Date): Date | null {
  if (range === "all") return null;
  const days = rangeDays(range);
  return new Date(bangkokDayStart(now).getTime() - (days - 1) * DAY_MS);
}

/** Bucket keys for the chart, oldest first, ending with today (Bangkok). */
export function dayBuckets(range: ChartRange, now: Date): string[] {
  const days = rangeDays(range);
  const start = rangeStart(range, now)!.getTime();
  return Array.from({ length: days }, (_, i) =>
    bangkokDayKey(new Date(start + i * DAY_MS)),
  );
}

/**
 * Sum `rows` into `keys`, then express each total as a percent of the
 * tallest bar so the chart can set bar heights directly. Rows whose day is
 * not in `keys` are ignored (they cannot happen if the DB filter matches
 * `rangeStart`, but a stray one must not throw).
 */
export function sumByDay(
  keys: string[],
  rows: { day: string; amount: number }[],
): { key: string; amount: number; pct: number }[] {
  const totals = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const row of rows) {
    const current = totals.get(row.day);
    if (current !== undefined) totals.set(row.day, current + row.amount);
  }
  const max = Math.max(0, ...totals.values());
  return keys.map((key) => {
    const amount = totals.get(key) ?? 0;
    return { key, amount, pct: max > 0 ? Math.round((amount / max) * 100) : 0 };
  });
}
```

- [ ] **Step 5: Run the tests — expect pass**

```bash
npm test
```

Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors (the `.ts` import is now allowed).

- [ ] **Step 7: Commit**

```bash
git add src/lib/range.ts src/lib/range.test.ts tsconfig.json package.json
git commit -m "Add Bangkok-day range helpers for the dashboard overview

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Extract the leaderboard SQL into `src/lib/leaderboard.ts`

**Files:**
- Create: `src/lib/leaderboard.ts`
- Modify: `src/app/[locale]/[username]/page.tsx:87-187` (the `Promise.all` entry + `topSupporters` post-processing)

**Interfaces:**
- Produces:
  ```ts
  export type Supporter = { name: string; total: number };
  export async function topSupporters(
    creatorId: string,
    opts: { limit: number; publicOnly: boolean; since?: Date | null },
  ): Promise<Supporter[]>;
  ```

- [ ] **Step 1: Record the current leaderboard values (baseline)**

Start the dev server (`preview_start` with `tiptang-dev`) and, for each of `/th/lig_1569` and `/th/nongmewtumarai`, `get_page_text` and copy the "อันดับผู้สนับสนุน" rows (name + amount, in order) into `scratchpad/leaderboard-before.txt`. These pages are public; no login needed.

- [ ] **Step 2: Create `src/lib/leaderboard.ts`**

The SQL body is moved **character for character** from the donate page; only the two conditional fragments and the `LIMIT` parameter are new.

```ts
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type Supporter = { name: string; total: number };

/**
 * Supporters ranked by confirmed total.
 *
 * Grouped on a NORMALIZED key, not the raw name: supporters have no
 * account and retype their name on every tip, so "Skye" / "skye" /
 * "Skye " are one person. We fold case + whitespace + invisible chars
 * ONLY. We deliberately do NOT fold Thai tone marks — they change the
 * word (ขาว != ข้าว), so folding them would credit one donor's money
 * to another. Prisma groupBy can only group by a raw column, so this
 * has to be raw SQL.
 *
 * NOTE the DOUBLE backslashes: this is a tagged template, so JS eats
 * one layer first. Postgres receives \u200B / \s and reads them as
 * regex escapes. A single backslash would silently reach Postgres as
 * a bare "s" and collapse the letter s instead of whitespace.
 *
 * `publicOnly` — the public donate page only ranks supporters who opted
 * in (`isMessagePublic`). The creator's own dashboard sees everyone,
 * because it already lists every name in the tip rows.
 * `since` — count only tips created at/after this instant (dashboard
 * range filter). Null/undefined = all time.
 */
export async function topSupporters(
  creatorId: string,
  opts: { limit: number; publicOnly: boolean; since?: Date | null },
): Promise<Supporter[]> {
  const rows = await prisma.$queryRaw<{ display: string; total: string }[]>`
      SELECT
        -- Show the spelling they used most recently, minus any stray
        -- leading combining mark (same reasoning as the GROUP BY below):
        -- it is a typing slip that renders as a floating mark, so there
        -- is no reason to print it back at them.
        regexp_replace(
          (array_agg("supporterName"
             ORDER BY COALESCE("confirmedAt", "createdAt") DESC))[1],
          '^[\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E]+', '') AS display,
        SUM("amount")::text AS total
      FROM "Tip"
      WHERE "creatorId" = ${creatorId}
        AND "status" = 'CONFIRMED'
        ${opts.publicOnly ? Prisma.sql`AND "isMessagePublic" = true` : Prisma.empty}
        ${opts.since ? Prisma.sql`AND "createdAt" >= ${opts.since}` : Prisma.empty}
        AND btrim("supporterName") <> ''
      GROUP BY lower(regexp_replace(
        btrim(regexp_replace(
          regexp_replace(normalize("supporterName", NFC),
                         '\\u200B|\\u200C|\\u200D|\\uFEFF', '', 'g'),
          '\\s+', ' ', 'g')),
        -- Drop Thai combining marks stranded at the START of the name.
        -- A tone mark or above/below vowel must sit ON a consonant; one in
        -- position 0 has nothing to combine with, so it is always a typo
        -- artifact and dropping it cannot change the word. (This is NOT the
        -- same as folding tone marks generally, which we refuse to do.)
        -- Leading vowels เ แ โ ใ ไ (U+0E40-44) are real and stay.
        '^[\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E]+', ''))
      -- Tie-break so equal totals keep a stable order across renders
      -- (whoever reached that total first ranks higher). Without this the
      -- leaderboard reshuffles on every refresh.
      ORDER BY SUM("amount") DESC,
               MIN(COALESCE("confirmedAt", "createdAt")) ASC
      LIMIT ${opts.limit}
    `;

  return (
    rows
      .map((g) => ({ name: g.display, total: Number(g.total) }))
      // A name made ONLY of stray combining marks strips down to nothing.
      // That supporter is indistinguishable from anonymous, and the query
      // already keeps anonymous tips off the leaderboard — so drop it here
      // too rather than rendering a blank row.
      .filter((s) => s.name !== "")
  );
}
```

- [ ] **Step 3: Use it from the donate page**

In `src/app/[locale]/[username]/page.tsx`:

1. Add the import next to the `goalRaised` import:
   ```ts
   import { topSupporters } from "@/lib/leaderboard";
   ```
2. In the `Promise.all` (line ~87) rename the destructured `topGroups` to `topSupportersList`:
   ```ts
   const [tips, raised, topSupportersList, shopItemsRaw] = await Promise.all([
   ```
3. Replace the whole block from the comment `// Leaderboard: total per supporter (opted-in = isMessagePublic).` through the closing backtick + comma of the `$queryRaw` call (everything up to but not including `// Shop items (only when …`) with:
   ```ts
       // Leaderboard: opted-in supporters only (isMessagePublic). See
       // src/lib/leaderboard.ts for why the grouping is done in SQL.
       topSupporters(creator.id, { limit: 5, publicOnly: true }),
   ```
4. Replace the post-processing block (`const topSupporters = topGroups … .filter((s) => s.name !== "");`) with:
   ```ts
     const topSupporters = topSupportersList;
   ```
   (The JSX below still reads `topSupporters`; keep that name so the render code is untouched.)

Confirm with grep that `$queryRaw` no longer appears in the donate page:

```bash
grep -n "queryRaw\|topGroups" "src/app/[locale]/[username]/page.tsx"
```

Expected: no output.

- [ ] **Step 4: Typecheck + verify the leaderboard is unchanged**

```bash
npx tsc --noEmit
```

Then reload `/th/lig_1569` and `/th/nongmewtumarai` in the Browser pane and `get_page_text`; compare the leaderboard rows against `scratchpad/leaderboard-before.txt`. Every name and amount, in the same order, must match. If anything differs, the SQL was not copied verbatim — diff the two.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leaderboard.ts "src/app/[locale]/[username]/page.tsx"
git commit -m "Move the supporter-ranking SQL into src/lib/leaderboard.ts

Same query, now with optional public-only / since filters so the
dashboard can reuse it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: i18n keys + `OnboardingChecklist`

**Files:**
- Modify: `messages/th.json` (`dashboard` namespace)
- Modify: `messages/en.json` (`dashboard` namespace)
- Create: `src/components/OnboardingChecklist.tsx`

**Interfaces:**
- Produces:
  ```tsx
  export async function OnboardingChecklist(props: {
    locale: string;
    promptpayDone: boolean;
    overlayDone: boolean;
    firstTipDone: boolean;
  }): Promise<ReactElement | null>;
  ```

- [ ] **Step 1: Add the new keys (both files)**

In `messages/th.json`, inside `"dashboard": {`, replace the three lines
```json
    "totalReceived": "ยอดที่ยืนยันแล้ว",
    "pendingCount": "รอยืนยัน",
    "tipsCount": "ทิปทั้งหมด",
```
with
```json
    "overview": "ภาพรวม",
    "rangeToday": "วันนี้",
    "range7d": "7 วัน",
    "range30d": "30 วัน",
    "rangeAll": "ทั้งหมด",
    "received": "ยอดรับ",
    "tipsInRange": "จำนวนทิป",
    "topSupporter": "ผู้สนับสนุนอันดับ 1",
    "chartBarTitle": "{date} · {amount}",
    "pendingLine": "รอยืนยัน {count} รายการ",
    "onboardingTitle": "เริ่มต้นใช้งาน",
    "onboardingPromptpay": "ใส่พร้อมเพย์ให้แฟน ๆ โอนได้",
    "onboardingOverlay": "ตั้งค่า OBS overlay สำหรับไลฟ์",
    "onboardingFirstTip": "รับทิปแรก",
    "onboardingFirstTipHint": "แชร์ลิงก์โปรไฟล์ให้แฟน ๆ",
    "goOverlay": "OBS overlay",
    "backToDashboard": "แดชบอร์ด",
```
and delete the line `"setupPromptpayWarning": "คุณยังไม่ได้ตั้งค่า PromptPay — ไปที่ตั้งค่าเพื่อให้แฟน ๆ ทิปได้",`.

In `messages/en.json`, same positions:
```json
    "overview": "Overview",
    "rangeToday": "Today",
    "range7d": "7 days",
    "range30d": "30 days",
    "rangeAll": "All time",
    "received": "Received",
    "tipsInRange": "Tips",
    "topSupporter": "Top supporter",
    "chartBarTitle": "{date} · {amount}",
    "pendingLine": "{count} tips awaiting confirmation",
    "onboardingTitle": "Getting started",
    "onboardingPromptpay": "Add your PromptPay so fans can pay you",
    "onboardingOverlay": "Set up the OBS overlay for your stream",
    "onboardingFirstTip": "Receive your first tip",
    "onboardingFirstTipHint": "Share your profile link with your fans",
    "goOverlay": "OBS overlay",
    "backToDashboard": "Dashboard",
```
and delete `"setupPromptpayWarning": "…"`.

Note: the dashboard page still references the deleted keys until Task 5 rewrites it — that is fine, next-intl only complains at runtime, and `tsc` does not type message keys in this project. Do not start the dev server on the dashboard between Task 3 and Task 5.

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/th.json','utf8'));JSON.parse(require('fs').readFileSync('messages/en.json','utf8'));console.log('ok')"
```

Expected: `ok`. (Run this via the PowerShell tool if the Bash quoting fights you.)

- [ ] **Step 3: Create `src/components/OnboardingChecklist.tsx`**

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/Icon";

type Step = { done: boolean; label: string } & (
  | { href: string; cta: string }
  | { hint: string }
);

/**
 * Three setup steps a new creator has to get through before TipTang does
 * anything for them. Every step is detected from data the page already
 * has — nothing to tick, and the whole block disappears once all three
 * are true, so established creators never see it.
 */
export async function OnboardingChecklist({
  locale,
  promptpayDone,
  overlayDone,
  firstTipDone,
}: {
  locale: string;
  promptpayDone: boolean;
  overlayDone: boolean;
  firstTipDone: boolean;
}) {
  if (promptpayDone && overlayDone && firstTipDone) return null;
  const t = await getTranslations("dashboard");

  const steps: Step[] = [
    {
      done: promptpayDone,
      label: t("onboardingPromptpay"),
      href: `/${locale}/dashboard/settings`,
      cta: t("goSettings"),
    },
    {
      done: overlayDone,
      label: t("onboardingOverlay"),
      href: `/${locale}/dashboard/overlay`,
      cta: t("goOverlay"),
    },
    {
      done: firstTipDone,
      label: t("onboardingFirstTip"),
      hint: t("onboardingFirstTipHint"),
    },
  ];

  return (
    <section>
      <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60">
        <Icon name="sparkles" />
        {t("onboardingTitle")}
      </h2>
      <ol className="divide-y divide-brand-900/10">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-3 py-2.5">
            {step.done ? (
              <Icon name="check-circle" className="h-5 w-5 text-emerald-600" />
            ) : (
              <span
                className="h-5 w-5 shrink-0 rounded-full border-2 border-brand-300"
                aria-hidden
              />
            )}
            <span
              className={`min-w-0 flex-1 ${
                step.done ? "text-brand-900/50" : "font-medium text-brand-900"
              }`}
            >
              {step.label}
            </span>
            {!step.done &&
              ("href" in step ? (
                <Link
                  href={step.href}
                  className="shrink-0 text-sm font-semibold text-brand-700 hover:underline"
                >
                  {step.cta} →
                </Link>
              ) : (
                <span className="shrink-0 text-sm text-brand-900/60">
                  {step.hint}
                </span>
              ))}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add messages/th.json messages/en.json src/components/OnboardingChecklist.tsx
git commit -m "Add dashboard overview/onboarding strings and the OnboardingChecklist

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: `/dashboard/overlay` page

**Files:**
- Create: `src/app/[locale]/dashboard/overlay/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { OverlaySettings } from "@/components/OverlaySettings";

/**
 * OBS overlay settings on their own page. The component is set up once
 * and rarely revisited, so it no longer lives on the dashboard home.
 * `OverlaySettings` brings its own heading + card; nothing to add here.
 */
export default async function OverlayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sessionUser = await requireUser();
  if (!sessionUser) redirect(`/${locale}/login`);

  const t = await getTranslations("dashboard");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/${locale}/dashboard`}
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
      >
        ← {t("backToDashboard")}
      </Link>
      <OverlaySettings />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/[locale]/dashboard/overlay/page.tsx"
git commit -m "Give the OBS overlay settings their own page at /dashboard/overlay

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Rewrite the dashboard home

**Files:**
- Rewrite: `src/app/[locale]/dashboard/page.tsx`

**Interfaces:**
- Consumes: `parseRange`, `rangeStart`, `hasChart`, `dayBuckets`, `bangkokDayKey`, `sumByDay`, `RANGES`, `Range` from `@/lib/range`; `topSupporters` from `@/lib/leaderboard`; `OnboardingChecklist`.

- [ ] **Step 1: Replace the whole file**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatBaht } from "@/lib/format";
import { topSupporters } from "@/lib/leaderboard";
import {
  RANGES,
  bangkokDayKey,
  dayBuckets,
  hasChart,
  parseRange,
  rangeStart,
  sumByDay,
  type Range,
} from "@/lib/range";
import { TipRow } from "@/components/TipRow";
import { AutoRefresh } from "@/components/AutoRefresh";
import { ClearRejectedButton } from "@/components/ClearRejectedButton";
import { CopyLink } from "@/components/CopyLink";
import { OnboardingChecklist } from "@/components/OnboardingChecklist";
import { ReportForm } from "@/components/ReportForm";
import { SHOP_ENABLED } from "@/lib/features";
import { Icon } from "@/components/Icon";

const RANGE_LABEL: Record<Range, "rangeToday" | "range7d" | "range30d" | "rangeAll"> = {
  today: "rangeToday",
  "7d": "range7d",
  "30d": "range30d",
  all: "rangeAll",
};

const pillClass =
  "inline-flex items-center gap-2 rounded-full border border-brand-300 bg-brand-50/70 px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-100";

const sectionTitleClass =
  "flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-900/60";

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const range = parseRange((await searchParams).range);
  const t = await getTranslations("dashboard");
  const tShop = await getTranslations("shop");
  const tCommon = await getTranslations("common");
  const currencyLocale = locale === "th" ? "th-TH" : "en-US";

  const sessionUser = await requireUser();
  if (!sessionUser) redirect(`/${locale}/login`);
  const userId = sessionUser.id;

  // The overview counts by when the tip CAME IN (createdAt), same as the
  // list below is ordered, so "today" means "tips sent today". Day
  // boundaries are Bangkok — see src/lib/range.ts.
  const now = new Date();
  const start = rangeStart(range, now);
  const inRange = {
    creatorId: userId,
    status: "CONFIRMED" as const,
    ...(start ? { createdAt: { gte: start } } : {}),
  };

  // One parallel batch, as before: none of these depend on each other.
  const [user, tips, rangeAgg, rangeTips, top, pendingCount, confirmedEver] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          displayName: true,
          username: true,
          promptpayId: true,
          overlayKey: true,
        },
      }),
      prisma.tip.findMany({
        where: { creatorId: userId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          supporterName: true,
          message: true,
          amount: true,
          status: true,
          slipUrl: true,
          autoVerified: true,
          verifyCode: true,
          verifyDetail: true,
          createdAt: true,
        },
      }),
      prisma.tip.aggregate({
        where: inRange,
        _sum: { amount: true },
        _count: true,
      }),
      // Only the chart needs individual rows, and only for 7d/30d.
      hasChart(range)
        ? prisma.tip.findMany({
            where: inRange,
            select: { amount: true, createdAt: true },
          })
        : Promise.resolve([]),
      // The creator sees every supporter, opted-in or not — the tip rows
      // below already show every name.
      topSupporters(userId, { limit: 1, publicOnly: false, since: start }),
      prisma.tip.count({ where: { creatorId: userId, status: "PENDING" } }),
      prisma.tip.count({ where: { creatorId: userId, status: "CONFIRMED" } }),
    ]);
  if (!user) {
    return null;
  }

  const received = Number(rangeAgg._sum.amount ?? 0);
  const tipsInRange = rangeAgg._count;
  const topSupporter = top[0] ?? null;
  const chart = hasChart(range)
    ? sumByDay(
        dayBuckets(range, now),
        rangeTips.map((tip) => ({
          day: bangkokDayKey(tip.createdAt),
          amount: Number(tip.amount),
        })),
      )
    : null;
  const barDate = new Intl.DateTimeFormat(currencyLocale, {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  });

  const rejectedCount = tips.filter((tip) => tip.status === "REJECTED").length;
  const profilePath = `/${locale}/${user.username}`;

  // Convert Prisma Decimal -> number BEFORE passing to the client component.
  const clientTips = tips.map((tip) => ({
    id: tip.id,
    supporterName: tip.supporterName,
    message: tip.message,
    amount: Number(tip.amount),
    status: tip.status,
    slipUrl: tip.slipUrl,
    autoVerified: tip.autoVerified,
    verifyCode: tip.verifyCode,
    verifyDetail: tip.verifyDetail,
    createdAt: tip.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-8">
      {/* Keep the tip list fresh without a manual reload. */}
      <AutoRefresh />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-brand-900">
          {t("welcome", { name: user.displayName })}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link href={`/${locale}/start`} className={pillClass}>
            <Icon name="book-open" />
            {tCommon("guide")}
          </Link>
          {SHOP_ENABLED && (
            <Link href={`/${locale}/dashboard/shop`} className={pillClass}>
              <Icon name="shopping-bag" />
              {tShop("dashboardTitle")}
            </Link>
          )}
          <Link href={`/${locale}/dashboard/overlay`} className={pillClass}>
            <Icon name="monitor" />
            {t("goOverlay")}
          </Link>
          <Link href={`/${locale}/dashboard/settings`} className={pillClass}>
            <Icon name="settings" />
            {t("goSettings")}
          </Link>
        </div>
      </div>

      <OnboardingChecklist
        locale={locale}
        promptpayDone={Boolean(user.promptpayId)}
        overlayDone={Boolean(user.overlayKey)}
        firstTipDone={confirmedEver > 0}
      />

      {/* Overview — one range at a time, chosen via ?range= so the page
          stays a server component and the choice survives a reload. */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className={sectionTitleClass}>
            <Icon name="zap" />
            {t("overview")}
          </h2>
          <nav
            aria-label={t("overview")}
            className="flex flex-wrap gap-0.5 rounded-full border border-brand-200 p-0.5"
          >
            {RANGES.map((r) => {
              const active = r === range;
              return (
                <Link
                  key={r}
                  href={{ pathname: `/${locale}/dashboard`, query: { range: r } }}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-brand-600 text-white"
                      : "text-brand-900/70 hover:bg-brand-100"
                  }`}
                >
                  {t(RANGE_LABEL[r])}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-extrabold tabular-nums text-brand-600 sm:text-3xl">
              {formatBaht(received, currencyLocale)}
            </p>
            <p className="mt-0.5 text-xs text-brand-900/60">{t("received")}</p>
          </div>
          <div>
            <p className="text-2xl font-extrabold tabular-nums text-brand-900 sm:text-3xl">
              {tipsInRange}
            </p>
            <p className="mt-0.5 text-xs text-brand-900/60">{t("tipsInRange")}</p>
          </div>
          <div className="min-w-0">
            <p className="truncate text-2xl font-extrabold text-brand-900 sm:text-3xl">
              {topSupporter ? topSupporter.name : "—"}
            </p>
            <p className="mt-0.5 text-xs text-brand-900/60">
              {t("topSupporter")}
              {topSupporter && (
                <>
                  {" · "}
                  <span className="tabular-nums">
                    {formatBaht(topSupporter.total, currencyLocale)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {chart && (
          <div className="mt-4 flex h-14 items-end gap-1">
            {chart.map((bar) => (
              <div
                key={bar.key}
                title={t("chartBarTitle", {
                  date: barDate.format(new Date(`${bar.key}T00:00:00+07:00`)),
                  amount: formatBaht(bar.amount, currencyLocale),
                })}
                className={`min-h-0.5 flex-1 rounded-t ${
                  bar.amount > 0 ? "bg-brand-500/70" : "bg-brand-200"
                }`}
                style={bar.amount > 0 ? { height: `${bar.pct}%` } : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {pendingCount > 0 && (
        <Link
          href="#tips"
          className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 hover:underline dark:text-amber-400"
        >
          <Icon name="clock" />
          {t("pendingLine", { count: pendingCount })} →
        </Link>
      )}

      {/* Profile link — a row, not a card */}
      <section>
        <h2 className={sectionTitleClass}>
          <Icon name="link" />
          {t("yourLink")}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm text-brand-800">
            {profilePath}
          </code>
          <CopyLink path={profilePath} label={t("copyLink")} copiedLabel={t("copied")} />
          <Link
            href={profilePath}
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            {t("viewProfile")} →
          </Link>
        </div>
      </section>

      {/* Tips */}
      <div id="tips">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-brand-900">{t("tipsTitle")}</h2>
          {rejectedCount > 0 && <ClearRejectedButton count={rejectedCount} />}
        </div>
        {clientTips.length === 0 ? (
          <p className="card rounded-2xl p-6 text-center text-brand-900/60">
            {t("noTips")}
          </p>
        ) : (
          <ul className="space-y-3">
            {clientTips.map((tip) => (
              <TipRow key={tip.id} tip={tip} locale={locale} />
            ))}
          </ul>
        )}
      </div>

      {/* Report / contact admin */}
      <ReportForm />
    </div>
  );
}
```

- [ ] **Step 2: Confirm nothing else imports the old bits**

```bash
grep -rn "OverlaySettings\|setupPromptpayWarning\|totalReceived\|tipsCount\|\"pendingCount\"" src messages
```

Expected: `OverlaySettings` only in `src/components/OverlaySettings.tsx` and `src/app/[locale]/dashboard/overlay/page.tsx`; the three keys appear nowhere.

- [ ] **Step 3: Typecheck, lint, unit tests**

```bash
npx tsc --noEmit
```
```bash
npm run lint
```
```bash
npm test
```

Expected: tsc clean · lint exactly 5 errors, all `react-hooks/set-state-in-effect`, none in files touched by this plan · 7 tests pass.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/dashboard/page.tsx"
git commit -m "Dashboard home: range overview, onboarding checklist, no cards

Today / 7d / 30d / all via ?range=, Bangkok day boundaries. Pending
tips become a one-line action item. OBS settings now live at
/dashboard/overlay.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Browser verification

**Files:** none (verification only). Fix anything found, re-run Step 3 of Task 5, commit fixes separately.

- [ ] **Step 1: Production build, then clean restart of the dev server**

```bash
npm run build
```
Expected: succeeds; the routes list includes `/[locale]/dashboard/overlay`.

```bash
rm -rf .next
```
Then `preview_start` with `tiptang-dev`.

- [ ] **Step 2: Donate page still correct**

Open `/th/lig_1569` and `/th/nongmewtumarai`; `get_page_text`; leaderboard rows equal `scratchpad/leaderboard-before.txt`.

- [ ] **Step 3: Dashboard, logged in as the user** (the user is already signed in in the Browser pane's cookie jar; if not, ask the user to log in — never enter credentials)

Open `/th/dashboard` and check with `read_page` / `javascript_tool`:
1. Default tab = "7 วัน" (`[aria-current="page"]` text).
2. Click each of the 4 tabs: URL becomes `?range=today|7d|30d|all`, numbers change, chart has 7 bars on 7d, 30 on 30d (`document.querySelectorAll('.h-14 > div').length`), no chart on today/all.
3. `?range=xyz` → "7 วัน" active.
4. On "ทั้งหมด": ยอดรับ equals the old "ยอดที่ยืนยันแล้ว" value (from the last screenshot/DB total the user knows) and จำนวนทิป equals the total confirmed count.
5. `document.querySelectorAll('.card').length` = number of TipRow cards + 1 (ReportForm). No overview / link / checklist cards.
6. Checklist hidden for this account (all three done). Bar `title` tooltips read like `14 ก.ย. · ฿120`.
7. Console: no errors.

- [ ] **Step 4: Onboarding states**

Write `scratchpad/checklist-preview.tsx`? No — simplest honest check: temporarily open `/th/dashboard` with a throwaway edit that passes `promptpayDone={false} overlayDone={false} firstTipDone={false}` to `<OnboardingChecklist/>`, screenshot, then `git checkout -- "src/app/[locale]/dashboard/page.tsx"`. Verify: three rows, two with links (ตั้งค่า → / OBS overlay →), third with the hint; dark + light.

- [ ] **Step 5: Overlay page**

Open `/th/dashboard/overlay`: back link works; "แสดง URL overlay" reveals the config (network call to `/api/overlay/setup` returns 200). Open the same URL in a fresh context without cookies is not possible in the pane — instead `javascript_tool`: `fetch('/th/dashboard/overlay', {redirect:'manual', credentials:'omit'}).then(r=>r.type+' '+r.status)` → `opaqueredirect 0` proves logged-out access redirects.

- [ ] **Step 6: Responsive + dark**

`resize_window` mobile (375): no horizontal scroll (`document.documentElement.scrollWidth <= 375`), range pills wrap, three numbers fit (truncated supporter name OK). `colorScheme: "dark"` on both pages: pills, active tab, chart bars, amber pending line all readable. Reset to desktop.

- [ ] **Step 7: Screenshot for the user**

`computer screenshot` of the desktop dashboard on 7d and mobile; report to the user and stop. **Do not push** — the user tests, then says merge/push.

---

## Self-review

- Spec coverage: range tabs (T5), chart 7/30 only (T1 `hasChart` + T5), pending line (T5), checklist 3 auto steps + hidden when done (T3, T5), overlay page + header pill + checklist link (T4, T3, T5), no-card sections (T5), Bangkok days (T1), URL-driven + server component (T5), no schema/deps (all), leaderboard unchanged (T2 baseline/compare), deleted i18n keys (T3 + T5 grep), `id="tips"` anchor (T5), verification list (T6). `noSupporterYet` from the spec is not needed — the page prints a literal `—`; spec updated to match.
- Types: `topSupporters` signature identical in T2 and T5; `sumByDay` rows `{ day, amount }` in T1 and T5; `OnboardingChecklist` props identical in T3 and T5; `RANGE_LABEL` values are exactly the keys added in T3.
- Placeholders: none.
