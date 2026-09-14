# Goal Reset + Uncapped Percentage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ครีเอเตอร์กด "เริ่มรอบใหม่" ให้ goal bar กลับเป็น 0 (เป้าเดิม ทิปเก่าไม่ถูกแตะ) และเปอร์เซ็นต์วิ่งเกิน 100 ได้จนกว่าจะกดล้าง

**Architecture:** เพิ่ม `User.goalStartedAt` (nullable) เป็นจุดเริ่มนับของรอบปัจจุบัน ยอด goal คำนวณสดจากทิปที่ยืนยันหลังเวลานั้นผ่านฟังก์ชันเดียว `goalRaised()` ซึ่งทั้งหน้าโปรไฟล์และ API ของ overlay เรียกใช้ การกดล้างคือ `kind: "goalReset"` ใน route `/api/overlay/asset` ที่มีอยู่ ตั้งค่าเวลาเป็นตอนนี้ ไม่มีการลบหรือแก้ทิปใดๆ

**Tech Stack:** Next.js 16.2 App Router · Prisma 7.8 + PostgreSQL (Supabase) · next-intl 4.13 · TypeScript 5

**Spec:** `docs/superpowers/specs/2026-09-14-goal-reset-design.md`

## Global Constraints

- **ห้าม `git push`** — ผู้ใช้ขอทดสอบเองก่อน commit ในเครื่องได้ตามปกติ
- **ฐานข้อมูลเป็นตัวจริง (Supabase production)** — การ apply migration แตะ production ต้องได้รับการยืนยันจากผู้ใช้ก่อนรัน (Task 1 ขั้น 5) ห้ามรันเงียบๆ
- **ไม่เรียก `revalidatePath`** สำหรับ goal — หน้าโปรไฟล์เป็น dynamic และ goal bar poll API ทุก 5 วิ (เหตุผลอยู่ใน spec)
- Migration workflow ของโปรเจกต์ (PROJECT.md:74): แก้ schema → เขียน `migration.sql` เอง (UTF-8) → `npx prisma migrate deploy` → `npx prisma generate` — **ไม่ใช้ `migrate dev`**
- ไฟล์ TS ทุกไฟล์บันทึกเป็น UTF-8 · โปรเจกต์ไม่มี test framework → ทุก task ปิดด้วยคำสั่งตรวจสอบ + ผลที่ต้องได้ (tsc / dev server / curl) ตาม spec §การทดสอบ
- `npm run lint` มี error เดิม **5** ตัว (`react-hooks/set-state-in-effect`) ตัวเลขต้องคงที่ ถ้าเพิ่ม = เราทำพัง
- ข้อความ UI ใหม่ต้องมีทั้ง `messages/th.json` และ `messages/en.json` ใน namespace `dashboard`

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `prisma/schema.prisma` | เพิ่มฟิลด์ `goalStartedAt` ใน `User` | แก้ |
| `prisma/migrations/20260914000000_add_goal_started_at/migration.sql` | ALTER TABLE เพิ่มคอลัมน์ nullable | สร้าง |
| `src/lib/goal.ts` | `goalRaised()` + `goalPercent()` — ที่เดียวที่รู้ว่ายอด goal นับยังไง | สร้าง |
| `src/app/api/overlay/[username]/goal/route.ts` | API ที่ overlay poll — ใช้ `goalRaised`/`goalPercent` | แก้ |
| `src/app/[locale]/[username]/page.tsx` | หน้าโปรไฟล์ — ใช้ `goalRaised`/`goalPercent`, clamp ความกว้างแถบ | แก้ |
| `src/components/GoalOverlayClient.tsx` | clamp ความกว้างแถบบนจอไลฟ์ | แก้ |
| `src/app/api/overlay/asset/route.ts` | เพิ่ม `kind === "goalReset"` | แก้ |
| `src/app/api/overlay/setup/route.ts` | คืน `goalStartedAt` ให้หน้าตั้งค่า | แก้ |
| `src/components/OverlaySettings.tsx` | ปุ่มเริ่มรอบใหม่ + "นับตั้งแต่ …" | แก้ |
| `messages/th.json`, `messages/en.json` | 4 ข้อความใหม่ | แก้ |

---

### Task 1: ฟิลด์ `goalStartedAt` + migration

**Files:**
- Modify: `prisma/schema.prisma:156-157` (หลัง `goalOverlayEnabled`)
- Create: `prisma/migrations/20260914000000_add_goal_started_at/migration.sql`

**Interfaces:**
- Produces: `User.goalStartedAt: Date | null` ใน Prisma client — ทุก task หลังจากนี้ใช้ฟิลด์นี้

- [ ] **Step 1: เพิ่มฟิลด์ใน schema**

ใน `prisma/schema.prisma` หาบรรทัด

```prisma
  // Whether the goal-bar OBS overlay is shown on stream (creator can toggle).
  goalOverlayEnabled Boolean @default(true)
```

เพิ่มต่อท้ายทันที:

```prisma
  // When the current goal round started ("start a new round" button). Only
  // tips confirmed at/after this moment count toward the goal. Null = never
  // reset, so every confirmed tip counts — the behaviour before this field
  // existed, which keeps existing creators unaffected.
  goalStartedAt DateTime?
```

- [ ] **Step 2: เขียน migration เอง (ตาม workflow โปรเจกต์)**

สร้างโฟลเดอร์ `prisma/migrations/20260914000000_add_goal_started_at/` แล้วไฟล์ `migration.sql` (UTF-8):

```sql
-- AlterTable: goal bar "start a new round". When set, only tips confirmed at or
-- after this moment count toward the goal. NULL = count everything, which is
-- exactly the previous behaviour, so no backfill is needed.
ALTER TABLE "User" ADD COLUMN     "goalStartedAt" TIMESTAMP(3);
```

(รูปแบบ `ADD COLUMN     "x"` เว้น 5 ช่อง ตามที่ Prisma gen ให้ในไฟล์ก่อนๆ — ดู `20260729000000_add_shop_delivery/migration.sql`)

- [ ] **Step 3: gen Prisma client (ไม่แตะ DB)**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client` ไม่มี error

- [ ] **Step 4: ยืนยันว่า client รู้จักฟิลด์**

Run: `npx tsc --noEmit`
Expected: ผ่านเงียบ (ยังไม่มีโค้ดใช้ฟิลด์ แค่เช็กว่า schema ถูก)

- [ ] **Step 5: ⛔ Apply migration — ต้องได้รับการยืนยันจากผู้ใช้ก่อน**

คำสั่งนี้แก้ schema ของ **ฐานข้อมูล production** (Supabase ตัวจริงที่มีครีเอเตอร์ใช้อยู่)
เป็นการเพิ่มคอลัมน์ nullable = ปลอดภัย ย้อนกลับได้ แต่**ห้ามรันโดยไม่ถาม**

บอกผู้ใช้ว่าจะรันคำสั่งนี้ รอคำตอบ "ทำได้" ก่อน:

Run: `npx prisma migrate deploy`
Expected:
```
1 migration found in prisma/migrations
Applying migration `20260914000000_add_goal_started_at`
All migrations have been successfully applied.
```

ถ้าผู้ใช้อยากรันเอง ให้เขาก็อปคำสั่งไป แล้วรอจนเขายืนยันว่าเสร็จ

**ทำไมต้อง apply ก่อน Task 2:** Task 2 เป็นต้นไปจะ `select: { goalStartedAt: true }` — ถ้าคอลัมน์ยังไม่มีในฐานข้อมูล ทุกหน้าที่โหลด user จะพัง ทดสอบในเครื่องไม่ได้เลย

- [ ] **Step 6: Commit (schema + migration เท่านั้น)**

```bash
git add prisma/schema.prisma prisma/migrations/20260914000000_add_goal_started_at/migration.sql
git commit -m "Add User.goalStartedAt for goal-bar new-round reset

Nullable; null keeps the previous count-everything behaviour so existing
creators are unaffected and no backfill is needed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `goalRaised()` / `goalPercent()` + API ของ overlay

**Files:**
- Create: `src/lib/goal.ts`
- Modify: `src/app/api/overlay/[username]/goal/route.ts:17-38`

**Interfaces:**
- Consumes: `User.goalStartedAt` จาก Task 1
- Produces:
  - `goalRaised(creatorId: string, goalStartedAt: Date | null): Promise<number>`
  - `goalPercent(raised: number, goalAmount: number): number` — **ไม่ตัดที่ 100**

- [ ] **Step 1: สร้าง `src/lib/goal.ts`**

```ts
import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Sum of confirmed tips that count toward the creator's CURRENT goal round.
 *
 * `goalStartedAt` is when the creator last pressed "start a new round"; only
 * tips confirmed at/after it count. Null means they never reset, so every
 * confirmed tip counts — exactly the behaviour before the field existed.
 *
 * Computed live from the tips every time (no stored running total), so a tip
 * that is rejected or deleted later simply stops counting. Nothing can drift.
 */
export async function goalRaised(
  creatorId: string,
  goalStartedAt: Date | null,
): Promise<number> {
  const agg = await prisma.tip.aggregate({
    where: {
      creatorId,
      status: "CONFIRMED",
      // Spread the date filter in only when a round has been started, so an
      // un-reset creator sends no filter at all rather than an empty one.
      ...(goalStartedAt ? { confirmedAt: { gte: goalStartedAt } } : {}),
    },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

/**
 * Percent of the goal reached. Deliberately NOT capped at 100 — a creator who
 * blew past the goal sees 150%, and it keeps climbing until they reset. The
 * bar's fill width is clamped separately where it is drawn.
 */
export function goalPercent(raised: number, goalAmount: number): number {
  return goalAmount > 0 ? Math.round((raised / goalAmount) * 100) : 0;
}
```

- [ ] **Step 2: แก้ API route ให้ใช้ทั้งสองฟังก์ชัน**

ใน `src/app/api/overlay/[username]/goal/route.ts`:

เพิ่ม import ใต้ `import { prisma } ...`:

```ts
import { goalRaised, goalPercent } from "@/lib/goal";
```

ใน `select` ของ `prisma.user.findUnique` เพิ่ม `goalStartedAt: true,` ต่อจาก `goalAmount: true,`:

```ts
    select: {
      id: true,
      overlayKey: true,
      goalTitle: true,
      goalAmount: true,
      goalStartedAt: true,
      goalOverlayEnabled: true,
    },
```

แทนที่บล็อกนี้ทั้งก้อน:

```ts
  const agg = await prisma.tip.aggregate({
    where: { creatorId: user.id, status: "CONFIRMED" },
    _sum: { amount: true },
  });

  const goal = user.goalAmount ? Number(user.goalAmount) : 0;
  const raised = Number(agg._sum.amount ?? 0);
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
```

ด้วย:

```ts
  const goal = user.goalAmount ? Number(user.goalAmount) : 0;
  const raised = await goalRaised(user.id, user.goalStartedAt);
  const pct = goalPercent(raised, goal);
```

- [ ] **Step 3: ตรวจ type**

Run: `npx tsc --noEmit`
Expected: ผ่านเงียบ

- [ ] **Step 4: ตรวจว่า API ยังตอบและยังกันคนไม่มี key**

Run (dev server ต้องรันอยู่ — `preview_start` ชื่อ `tiptang-dev`):
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/overlay/lig_1569/goal
```
Expected: `403` (ไม่มี key → ปฏิเสธเหมือนเดิม แปลว่า route คอมไพล์และรันได้)

- [ ] **Step 5: Commit**

```bash
git add src/lib/goal.ts "src/app/api/overlay/[username]/goal/route.ts"
git commit -m "Count goal-bar tips from goalStartedAt and stop capping the percent

One helper owns the rule (goalRaised/goalPercent) so the profile page and
the overlay API cannot drift apart. Null goalStartedAt still counts every
tip, so creators who never reset see no change.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: หน้าโปรไฟล์ + clamp แถบบนจอไลฟ์

**Files:**
- Modify: `src/app/[locale]/[username]/page.tsx:69-74, 85-104, 188-192, 310`
- Modify: `src/components/GoalOverlayClient.tsx:80`

**Interfaces:**
- Consumes: `goalRaised`, `goalPercent` จาก Task 2

- [ ] **Step 1: import**

ใน `src/app/[locale]/[username]/page.tsx` เพิ่มใต้ `import { prisma } ...`:

```ts
import { goalRaised, goalPercent } from "@/lib/goal";
```

- [ ] **Step 2: select ฟิลด์ใหม่**

ใน `prisma.user.findUnique({ select: { ... } })` ของ creator เพิ่ม `goalStartedAt: true,` ต่อจาก `goalAmount: true,`:

```ts
      goalTitle: true,
      goalAmount: true,
      goalStartedAt: true,
      socialLinks: true,
```

- [ ] **Step 3: แทน aggregate ใน `Promise.all`**

`confirmedAgg` ตัวนี้**ใช้กับ goal bar อย่างเดียว** (ตรวจแล้ว: ตัวแปร `raised` ถูกใช้แค่บรรทัด 192 กับ 317) จึงแทนได้ตรงๆ

เปลี่ยน destructure:

```ts
  const [tips, confirmedAgg, topGroups, shopItemsRaw] = await Promise.all([
```
เป็น
```ts
  const [tips, raised, topGroups, shopItemsRaw] = await Promise.all([
```

แทนที่ก้อนนี้ใน `Promise.all`:

```ts
    prisma.tip.aggregate({
      where: { creatorId: creator.id, status: "CONFIRMED" },
      _sum: { amount: true },
    }),
```
ด้วย
```ts
    // Goal bar: tips since the creator last started a new round (all-time
    // when they never have). Not the same as the all-time total on purpose.
    goalRaised(creator.id, creator.goalStartedAt),
```

- [ ] **Step 4: ปลดตัวเลข % และคำนวณด้วย helper**

แทนที่:

```ts
  const raised = Number(confirmedAgg._sum.amount ?? 0);
  const goalPct =
    goalAmount > 0 ? Math.min(100, Math.round((raised / goalAmount) * 100)) : 0;
```
ด้วย
```ts
  const goalPct = goalPercent(raised, goalAmount);
```

- [ ] **Step 5: clamp ความกว้างแถบ (ตัวเลขวิ่งต่อ แต่แถบเต็มที่ 100)**

บรรทัด 310 เปลี่ยน

```ts
                width: `${goalPct}%`,
```
เป็น
```ts
                width: `${Math.min(100, goalPct)}%`,
```

- [ ] **Step 6: clamp แถบบนจอไลฟ์ด้วย**

ใน `src/components/GoalOverlayClient.tsx` บรรทัด 80 เปลี่ยน

```ts
              width: `${Math.max(goal.pct, 4)}%`,
```
เป็น
```ts
              width: `${Math.min(100, Math.max(goal.pct, 4))}%`,
```

(`goal.pct` มาจาก API ใน Task 2 ซึ่งไม่ตัดแล้ว ตัวเลข `{goal.pct}%` ที่บรรทัด 74 จะโชว์เกิน 100 ได้ตามต้องการ แถบไม่ล้น)

- [ ] **Step 7: ตรวจ type + หน้าจริง**

Run: `npx tsc --noEmit`
Expected: ผ่านเงียบ

Run:
```bash
node -e "fetch('http://localhost:3000/th/lig_1569').then(r=>r.text()).then(h=>{const m=h.match(/ได้รับแล้ว[^<]*/);console.log(m?m[0]:'ไม่เจอ goal bar');})"
```
Expected: `ได้รับแล้ว ฿68.00 จาก ฿10,000.00` (ยอดเท่าเดิมเป๊ะ — `goalStartedAt` ยัง null ทั้งฐานข้อมูล จึงต้องนับทุกทิปเหมือนเดิม **ถ้าตัวเลขเปลี่ยน = พัง**)

- [ ] **Step 8: Commit**

```bash
git add "src/app/[locale]/[username]/page.tsx" src/components/GoalOverlayClient.tsx
git commit -m "Show goal progress past 100% on the profile and overlay bar

The number keeps climbing; only the bar's fill is clamped so it never
overflows its track.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: API `goalReset` + คืน `goalStartedAt` ให้หน้าตั้งค่า

**Files:**
- Modify: `src/app/api/overlay/asset/route.ts:89-99` (แทรกหลังบล็อก `goalToggle`)
- Modify: `src/app/api/overlay/setup/route.ts:25-27, 93-96`

**Interfaces:**
- Consumes: `User.goalStartedAt`
- Produces:
  - `POST /api/overlay/asset` body `kind=goalReset` → `{ ok: true, goalStartedAt: string /* ISO */ }`
  - `POST /api/overlay/setup` response เพิ่มฟิลด์ `goalStartedAt: string | null` (ISO หรือ null)

- [ ] **Step 1: เพิ่ม kind ใหม่ใน asset route**

ใน `src/app/api/overlay/asset/route.ts` หาบล็อก

```ts
  // Goal-bar overlay on/off toggle.
  if (kind === "goalToggle") {
```

แทรก**ก่อน**บรรทัดคอมเมนต์นั้น:

```ts
  // "Start a new round": the goal bar counts only tips confirmed from this
  // moment on. Nothing is deleted or edited — old tips stay in the list, the
  // leaderboard, and the totals; only where the goal bar starts counting moves.
  // No revalidatePath here on purpose: the profile page is dynamic and the
  // on-stream bar polls /api/overlay/[username]/goal every 5s.
  if (kind === "goalReset") {
    const startedAt = new Date();
    await prisma.user.update({
      where: { id: session.user.id },
      data: { goalStartedAt: startedAt },
    });
    return NextResponse.json({ ok: true, goalStartedAt: startedAt.toISOString() });
  }

```

- [ ] **Step 2: setup route คืนฟิลด์ใหม่**

ใน `src/app/api/overlay/setup/route.ts`:

ใน `select` เพิ่ม `goalStartedAt: true,` ต่อจาก `goalAmount: true,`

ในอ็อบเจกต์ที่ `return NextResponse.json({...})` เพิ่มบรรทัดต่อจาก `goalAmount: ...`:

```ts
    goalStartedAt: user.goalStartedAt ? user.goalStartedAt.toISOString() : null,
```

- [ ] **Step 3: ตรวจ type**

Run: `npx tsc --noEmit`
Expected: ผ่านเงียบ

- [ ] **Step 4: ตรวจว่า route ยังกันคนไม่ล็อกอิน**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -F kind=goalReset http://localhost:3000/api/overlay/asset
```
Expected: `401` (ไม่มี session → ปฏิเสธ — พิสูจน์ว่า kind ใหม่อยู่หลังด่านเช็กสิทธิ์เดิม)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/overlay/asset/route.ts src/app/api/overlay/setup/route.ts
git commit -m "Add goalReset action and expose goalStartedAt to the settings page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: ปุ่ม "เริ่มรอบใหม่" + "นับตั้งแต่ …" ในหน้าตั้งค่า

**Files:**
- Modify: `messages/th.json`, `messages/en.json` (namespace `dashboard`, ถัดจาก `obsGoalSaved`)
- Modify: `src/components/OverlaySettings.tsx:3-4, 25-26, 55, 66, 113, 207-232, 982-991`

**Interfaces:**
- Consumes: `POST /api/overlay/asset kind=goalReset` และฟิลด์ `goalStartedAt` จาก Task 4 · `formatDate()` จาก `src/lib/format.ts`

- [ ] **Step 1: ข้อความ 4 ตัว ทั้ง 2 ภาษา**

ใน `messages/th.json` หา `"obsGoalSaved": "บันทึกแล้ว",` ใน namespace `dashboard` เพิ่มต่อท้าย:

```json
    "obsGoalReset": "เริ่มรอบใหม่",
    "obsGoalResetting": "กำลังล้าง…",
    "obsGoalResetConfirm": "เริ่มรอบใหม่? ยอดบน goal bar จะกลับเป็น 0 ทันที (ทิปเก่าไม่หายไปไหน)",
    "obsGoalSince": "นับตั้งแต่ {date}",
```

ใน `messages/en.json` หา `"obsGoalSaved": "Saved!",` เพิ่มต่อท้าย:

```json
    "obsGoalReset": "Start a new round",
    "obsGoalResetting": "Resetting…",
    "obsGoalResetConfirm": "Start a new round? The goal bar drops to 0 right away (your past tips are untouched).",
    "obsGoalSince": "Counting since {date}",
```

ตรวจว่า JSON ยังถูก: `node -e "require('./messages/th.json');require('./messages/en.json');console.log('json ok')"` → `json ok`

- [ ] **Step 2: imports ใน OverlaySettings**

เปลี่ยน
```ts
import { useTranslations } from "next-intl";
```
เป็น
```ts
import { useLocale, useTranslations } from "next-intl";
```

เพิ่มใต้ `import { Icon } ...`:
```ts
import { formatDate } from "@/lib/format";
```

- [ ] **Step 3: type + state**

ใน `type Config` เพิ่มต่อจาก `goalAmount: string;`:
```ts
  goalStartedAt: string | null; // ISO from the API; null = never reset
```

ใต้ `const t = useTranslations("dashboard");` เพิ่ม:
```ts
  const locale = useLocale();
  const dateLocale = locale === "th" ? "th-TH" : "en-US";
```

ใต้ `const [savingGoal, setSavingGoal] = useState(false);` เพิ่ม:
```ts
  const [resettingGoal, setResettingGoal] = useState(false);
```

- [ ] **Step 4: รับค่าตอนโหลด config**

ใน `setConfig({...})` ตอนโหลด (บล็อกที่มี `goalAmount: d.goalAmount ?? "",`) เพิ่มบรรทัดถัดไป:
```ts
          goalStartedAt: d.goalStartedAt ?? null,
```

- [ ] **Step 5: ฟังก์ชัน resetGoal (วางต่อจาก `saveGoal`)**

```ts
  async function resetGoal() {
    // This shows on the live stream within seconds — make them mean it.
    if (!window.confirm(t("obsGoalResetConfirm"))) return;
    setResettingGoal(true);
    try {
      const fd = new FormData();
      fd.set("kind", "goalReset");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok && typeof d.goalStartedAt === "string") {
        setConfig((c) => (c ? { ...c, goalStartedAt: d.goalStartedAt } : c));
        setGoalRefresh((n) => n + 1); // reload the preview iframe, like saveGoal
      }
    } finally {
      setResettingGoal(false);
    }
  }
```

- [ ] **Step 6: ปุ่ม + ข้อความ ในฟอร์ม goal**

หาปุ่มบันทึกเดิม (จบที่ `: t("obsGoalSave")}` แล้ว `</button>`) แทรก**ต่อจาก `</button>` นั้น** ก่อน `</div>` ที่ปิด `rounded-xl bg-brand-50 p-3`:

```tsx
                  {config.hasGoal && (
                    <button
                      type="button"
                      onClick={resetGoal}
                      disabled={resettingGoal || savingGoal}
                      className="btn-secondary mt-2 w-full py-2 text-sm"
                    >
                      {resettingGoal ? t("obsGoalResetting") : t("obsGoalReset")}
                    </button>
                  )}
                  {config.goalStartedAt && (
                    <p className="mt-2 text-center text-xs text-brand-900/55">
                      {t("obsGoalSince", {
                        date: formatDate(config.goalStartedAt, dateLocale),
                      })}
                    </p>
                  )}
```

(`btn-secondary` มีอยู่แล้ว — ใช้ใน `ReportForm.tsx` · `formatDate` รันฝั่งเบราว์เซอร์เพราะ component เป็น client และค่ามาหลัง fetch → เวลาไทยของผู้ใช้เอง ไม่มี hydration mismatch)

- [ ] **Step 7: ตรวจ type + lint คงที่**

Run: `npx tsc --noEmit`
Expected: ผ่านเงียบ

Run: `npm run lint 2>&1 | tail -1`
Expected: `✖ 5 problems (5 errors, 0 warnings)` — **ต้อง 5 เท่าเดิม**

- [ ] **Step 8: ทดสอบในเบราว์เซอร์ตาม spec (บัญชี lig_1569)**

เปิด `http://localhost:3000/th/dashboard/settings` (ล็อกอินเป็น lig_1569) เลื่อนไปส่วน Goal:

1. **ก่อน** — จด: goal บนโปรไฟล์ `/th/lig_1569`, จำนวนแถว leaderboard, จำนวนทิปในแดชบอร์ด
2. เห็นปุ่ม **"เริ่มรอบใหม่"** ใต้ปุ่มบันทึก · ยัง**ไม่มี** "นับตั้งแต่" (ยังไม่เคยกด)
3. กดปุ่ม → **มี confirm** → ระหว่างรอปุ่มเป็น "กำลังล้าง…" และกดซ้ำไม่ได้
4. เสร็จ → ขึ้น **"นับตั้งแต่ 14 ก.ย. 2569 HH:MM"** เป็นเวลาไทย · preview goal bar รีโหลดเป็น 0
5. `/th/lig_1569` → goal = **฿0.00 / 0%** · **leaderboard และรายการทิปเหมือนข้อ 1 เป๊ะ**
6. `/th/nongmewtumarai` (ไม่เคยกด) → ยอด goal **เท่าเดิม**

- [ ] **Step 9: Commit**

```bash
git add messages/th.json messages/en.json src/components/OverlaySettings.tsx
git commit -m "Let creators start a new goal round from the overlay settings

Confirms first (it lands on stream within seconds), disables while the
request is in flight, and shows when the current round started in the
creator's own timezone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: ตรวจรวมตาม spec แล้วส่งมอบ (ไม่ push)

**Files:** ไม่แก้อะไร

- [ ] **Step 1: build**

Run: `npm run build 2>&1 | tail -3`
Expected: จบด้วยตาราง route ไม่มี error

- [ ] **Step 2: เคสเปอร์เซ็นต์เกิน 100 (spec §ทดสอบ ข้อ 5)**

ในหน้าตั้งค่า ตั้งเป้าชั่วคราวเป็น `10` แล้วบันทึก (ยอดหลังกดล้างใน Task 5 เป็น 0 → ต้องมีทิปใหม่ก่อน; ถ้ายังไม่มี ให้**ข้ามข้อนี้ไปเช็กด้วยสูตรแทน**: `node -e "const {goalPercent}=require('./src/lib/goal.ts')"` รันไม่ได้เพราะ server-only — ให้เช็กด้วยตาที่โค้ด `goalPercent` ว่าไม่มี `Math.min`)

ถ้ามีทิปใหม่: โปรไฟล์ต้องโชว์ `%` เกิน 100 และแถบกว้างพอดี 100% ไม่ล้น · `GET /api/overlay/lig_1569/goal?key=…` คืน `pct` เกิน 100

**ตั้งเป้ากลับ**เป็นค่าเดิมหลังทดสอบ

- [ ] **Step 3: สรุปให้ผู้ใช้ — ห้าม push**

รายงาน: commits ที่ทำ, ผล tsc/lint/build, ผลทดสอบข้อ 1-6 ของ Task 5, และย้ำว่า **ยังไม่ได้ push** รอผู้ใช้ทดสอบเองแล้วสั่ง

---

## Self-review

**Spec coverage** — ทุกข้อใน spec มี task รองรับ: ฟิลด์ (T1) · goalRaised/goalPercent + conditional spread (T2) · 2 จุดเรียกใช้ (T2, T3) · ปลด min(100) + clamp แถบทั้ง 2 ที่ (T2, T3) · kind goalReset ไม่มี revalidatePath (T4) · setup คืน goalStartedAt (T4) · ปุ่ม + confirm + disabled + "นับตั้งแต่" + formatDate + i18n 4 key (T5) · deploy ผ่าน migrate deploy ก่อน (T1 ขั้น 5 gated) · ทดสอบ 6 ข้อ (T3 ขั้น 7, T5 ขั้น 8, T6)

**Placeholder scan** — ไม่มี TBD/TODO ทุกขั้นมีโค้ดจริงและผลที่คาดหวัง

**Type consistency** — `goalRaised(creatorId: string, goalStartedAt: Date | null): Promise<number>` และ `goalPercent(raised: number, goalAmount: number): number` ชื่อ/ลายเซ็นตรงกันทุก task · `Config.goalStartedAt: string | null` ตรงกับที่ setup route คืน (ISO | null) และที่ asset route คืน (ISO)
