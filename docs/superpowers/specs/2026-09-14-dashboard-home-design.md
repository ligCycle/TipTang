# หน้าแรกแดชบอร์ด: ภาพรวมเลือกช่วงเวลา · เช็กลิสต์เริ่มต้น · ย้าย OBS ไปหน้าของตัวเอง

วันที่: 2026-09-14 · สถานะ: อนุมัติในแชท (ผู้ใช้เลือกตัวเลือกช่วงเวลาแบบปุ่มแถวเดียว ค่าเริ่มต้น 7 วัน)

## ปัญหา

หน้า `/[locale]/dashboard` เป็นกล่องเรียงต่อกัน: ลิงก์โปรไฟล์ 1 กล่อง · `<OverlaySettings/>` ~1,000 บรรทัด
ฝังอยู่กลางหน้า · ตัวเลข 3 กล่อง (ยอดรวมตลอดกาล / รอยืนยัน / จำนวนทิป **ของ 100 รายการที่ดึงมา** —
ตัวเลขนี้ผิดความหมายอยู่แล้ว) · รายการทิป · แจ้งปัญหา

ผู้ใช้สรุปเอง: *"ยังไม่โปรพอ"* — ไม่มีตัวเลขที่บอกว่า**ช่วงนี้**เป็นยังไง, คนสมัครใหม่ไม่รู้ต้องทำอะไรต่อ,
ตั้งค่า OBS ยาวมากแต่ใช้ครั้งเดียวกลับอยู่หน้าแรกตลอด

## สิ่งที่ต้องได้

1. **ภาพรวมเลือกช่วงเวลาได้**: ปุ่ม `วันนี้ · 7 วัน · 30 วัน · ทั้งหมด` (ค่าเริ่มต้น 7 วัน) — เปลี่ยนแล้ว
   ยอดรับ / จำนวนทิป / ผู้สนับสนุนอันดับ 1 / กราฟรายวัน เปลี่ยนตาม
2. **กราฟรายวัน** เฉพาะ 7 วัน (7 แท่ง) และ 30 วัน (30 แท่ง) — วันนี้/ทั้งหมด ไม่มีกราฟ
3. **รอยืนยัน** เป็นบรรทัดงานค้าง ไม่ขึ้นกับช่วงเวลา · โชว์เฉพาะตอน `> 0` · กดแล้วเลื่อนไปรายการทิป
4. **เช็กลิสต์เริ่มต้น** 3 ข้อที่ระบบตรวจเองจากข้อมูล ไม่ต้องติ๊ก: ใส่พร้อมเพย์ (`promptpayId`) ·
   ตั้ง OBS overlay (`overlayKey` ไม่ null) · รับทิปแรก (มีทิป CONFIRMED ≥ 1) — ครบ 3 = ไม่แสดง
   คำเตือนพร้อมเพย์สีเหลืองเดิมถูกแทนด้วยข้อ 1
5. **`<OverlaySettings/>` ย้ายไปหน้าใหม่ `/[locale]/dashboard/overlay`** — คอมโพเนนต์ไม่แตะ · หน้าแรกมี
   ปุ่ม "OBS overlay" บนหัว และเช็กลิสต์ข้อ 2 ลิงก์ไปหน้านั้น
6. **ไม่เป็นกล่อง**: ภาพรวม / ลิงก์โปรไฟล์ / เช็กลิสต์ ใช้หัวข้อ + เส้นคั่น สไตล์เดียวกับหน้าโดเนท (B) ·
   `.card` ที่เหลือบนหน้าแรก = TipRow (เดิม) + ReportForm (เดิม) + กล่อง noTips (เดิม) เท่านั้น
7. "วันนี้" และขอบวันของกราฟนับตาม**เวลาไทย (Asia/Bangkok)** ไม่ใช่ UTC ของ Vercel
8. ช่วงเวลาอยู่ใน URL `?range=today|7d|30d|all` · หน้ายังเป็น server component · ไม่มี API ใหม่ ·
   ไม่มี client state · ค่าแปลกๆ ใน URL → ถือเป็น 7d
9. ไม่แตะ DB schema · ไม่เพิ่ม dependency · ไม่แตะ `TipRow` / `OverlaySettings` / `ReportForm`
10. ตัวเลขบนหน้าโดเนท (อันดับผู้สนับสนุน) **ต้องเท่าเดิมทุกตัว** หลัง refactor SQL ออกเป็น lib

## ดีไซน์

### โครงหน้า (`src/app/[locale]/dashboard/page.tsx`)

```
<AutoRefresh/>
หัว: h1 สวัสดี {name}  ·  ปุ่ม pill: คู่มือ · [ร้านค้า ถ้าเปิด] · OBS overlay (ใหม่) · ตั้งค่า
<OnboardingChecklist/>        เฉพาะเมื่อยังไม่ครบ 3 ข้อ
<section ภาพรวม>              หัวข้อ + <RangeTabs/> · ตัวเลข 3 ช่อง · กราฟ (7d/30d)
<p รอยืนยัน>                  เฉพาะ pendingCount > 0
<section ลิงก์โปรไฟล์>        แถวเดียว: หัวข้อเล็ก · code · คัดลอก · ดูหน้า →
รายการทิป                     เดิม (ใส่ id="tips" ให้ลิงก์รอยืนยันเลื่อนมาได้)
<ReportForm/>                 เดิม
```

หัวข้อทุก section สไตล์เดียวกับหน้าโดเนท: `text-xs font-semibold uppercase tracking-wide text-brand-900/60` + ไอคอน

### ช่วงเวลา (`src/lib/range.ts` — ฟังก์ชันล้วน ทดสอบได้ไม่ต้องใช้ DB)

```ts
export type Range = "today" | "7d" | "30d" | "all";
export const RANGES: Range[] = ["today", "7d", "30d", "all"];
export function parseRange(raw: string | string[] | undefined): Range   // ไม่รู้จัก → "7d"
export function rangeStart(range: Range, now: Date): Date | null        // all → null
export function bangkokDayStart(d: Date): Date   // 00:00 ของวันนั้นตามเวลาไทย เป็น Date (UTC instant)
export function bangkokDayKey(d: Date): string   // "2026-09-14" ตามเวลาไทย
export function dayBuckets(range: "7d" | "30d", now: Date): string[]   // key ทุกวันเรียงเก่า→ใหม่
```

- `today` → `bangkokDayStart(now)` · `7d` → `bangkokDayStart(now) - 6 วัน` (วันนี้รวมเป็น 7 วันปฏิทิน) ·
  `30d` → `- 29 วัน` · `all` → `null`
- คำนวณเวลาไทยด้วย `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year, month, day })`
  แล้ว `Date.UTC(y, m-1, d) - 7h` — ไม่พึ่ง TZ ของเครื่องที่รัน (Vercel = UTC, เครื่องผู้ใช้ = +7 ต้องได้ผลเดียวกัน)
- กรองด้วย `createdAt` (เวลาที่ทิปเข้ามา) ไม่ใช่ `confirmedAt` — ครีเอเตอร์คิดว่า "ทิปวันนี้" คือทิปที่ส่งมาวันนี้
  และรายการทิปด้านล่างก็เรียงด้วย `createdAt` อยู่แล้ว จะได้สอดคล้องกัน

### Query บนหน้าแรก (Promise.all ชุดเดียวเหมือนเดิม)

| ตัวแปร | query | ใช้ทำ |
|---|---|---|
| `user` | findUnique select `displayName, username, promptpayId, overlayKey` | หัว · เช็กลิสต์ |
| `tips` | findMany take 100 (เดิม) | รายการทิป |
| `rangeAgg` | `tip.aggregate` where CONFIRMED + `createdAt >= start` (ถ้ามี) → `_sum.amount, _count` | ยอดรับ · จำนวนทิป |
| `rangeTips` | 7d/30d เท่านั้น: findMany select `amount, createdAt` where เดียวกัน | กราฟ (bucket ใน JS) · all/today → `[]` ไม่ query |
| `topSupporter` | `topSupporters(userId, { since: start, publicOnly: false, limit: 1 })` | อันดับ 1 |
| `pendingCount` | count PENDING (เดิม) | บรรทัดงานค้าง |
| `confirmedEver` | count CONFIRMED (ไม่กรองช่วง) | เช็กลิสต์ข้อ 3 |

### `src/lib/leaderboard.ts` (ดึง SQL ออกจากหน้าโดเนท)

```ts
export async function topSupporters(
  creatorId: string,
  opts: { limit: number; publicOnly: boolean; since?: Date | null },
): Promise<{ name: string; total: number }[]>
```

SQL เดิมทั้งก้อน (normalize NFC, ลบ zero-width, ยุบช่องว่าง, ตัดวรรณยุกต์นำหน้า, `lower`) ย้ายมาที่นี่
**ตัวอักษรต่อตัวอักษร** — เพิ่มแค่สอง fragment แบบมีเงื่อนไขด้วย `Prisma.sql`/`Prisma.empty`:
`AND "isMessagePublic" = true` (เมื่อ `publicOnly`) และ `AND "createdAt" >= ${since}` (เมื่อ `since`)
หน้าโดเนทเรียก `topSupporters(creator.id, { limit: 5, publicOnly: true })` → ผลต้องเท่าเดิม
แดชบอร์ดเรียก `{ limit: 1, publicOnly: false, since: start }` — ครีเอเตอร์เห็นชื่อทุกคนที่ทิปตัวเองอยู่แล้วใน TipRow
จึงไม่ต้องกรอง public

คำเตือน backslash เดิมยังอยู่: tagged template ต้อง `\\u200B` สองตัว (ดู comment ในโค้ดเดิม)

### ภาพรวม — มาร์กอัป

- แถวหัว: `<h2>ภาพรวม</h2>` ซ้าย · `<RangeTabs/>` ขวา — 4 `<Link href="?range=…">` ในกรอบกลม
  `rounded-full border border-brand-200 p-0.5` · ปุ่มที่เลือก `bg-brand-600 text-white` ที่เหลือ `text-brand-900/70`
  · `aria-current="page"` บนตัวที่เลือก · `scroll={false}` จะได้ไม่กระโดดขึ้นบนสุด
- ตัวเลข: `grid grid-cols-3 gap-4` (มือถือด้วย — 3 ตัวพอ) แต่ละช่อง: ค่า `text-2xl sm:text-3xl font-extrabold tabular-nums`
  ยอดรับสี `text-brand-600` · ป้าย `text-xs text-brand-900/60` ใต้ค่า · อันดับ 1 = ชื่อ `truncate` + ยอดเล็กใต้ชื่อ ·
  ไม่มีใคร → `—`
- กราฟ (7d/30d): `<div class="flex h-14 items-end gap-1">` แท่งละ `<div title="14 ก.ย. · ฿120" style="height:X%">`
  `flex-1 rounded-t bg-brand-500/70` · แท่ง 0 บาท = `min-h-0.5 bg-brand-200` · ความสูง = `amount / max * 100`
  · **ไม่มี** แกน ไม่มีป้ายวันที่ (title พอ — 30 ป้ายไม่มีที่วาง) · เป็น server-rendered div ล้วน ไม่มี lib
- ทั้งหมดเป็น server component — ไม่มี `"use client"` ใหม่ในหน้าแรกเลย

### รอยืนยัน

`<Link href="#tips">` บรรทัดเดียว: ไอคอน `clock` สี amber + `รอยืนยัน {count} รายการ →` — แสดงเฉพาะ `pendingCount > 0`
(เงื่อนไข `showPending` เดิมที่ดูจาก `autoConfirmTips` ตัดทิ้ง — งานค้างคือ pending > 0 เท่านั้น)

### เช็กลิสต์ (`src/components/OnboardingChecklist.tsx` — server component)

props: `{ locale, promptpayDone, overlayDone, firstTipDone }` · ถ้าครบทั้ง 3 → `return null`
มาร์กอัป: หัวข้อ `เริ่มต้นใช้งาน` + `<ol>` 3 แถว `divide-y`: ไอคอน `check-circle` (สีเขียว emerald เมื่อเสร็จ) หรือวงกลมว่าง
`border-2 border-brand-300` · ชื่อขั้น · ยังไม่เสร็จ → ลิงก์ `ตั้งค่า →` / `ไปหน้า OBS →` · ข้อ 3 ไม่มีลิงก์ แค่คำอธิบาย
"แชร์ลิงก์ให้แฟน ๆ"

### หน้าใหม่ `src/app/[locale]/dashboard/overlay/page.tsx`

server component: `requireUser` + redirect เหมือน settings · `<div class="mx-auto max-w-3xl space-y-6">` ·
ลิงก์กลับ `← แดชบอร์ด` · `<OverlaySettings/>` ทั้งก้อน (มันมี h2 + .card ของตัวเอง ไม่ต้องใส่หัวซ้ำ)

### i18n (`dashboard` namespace, th + en)

`overview`, `rangeToday`, `range7d`, `range30d`, `rangeAll`, `received`, `tipsInRange`, `topSupporter`,
`pendingLine` (`รอยืนยัน {count} รายการ`), `onboardingTitle`, `onboardingPromptpay`,
`onboardingOverlay`, `onboardingFirstTip`, `onboardingFirstTipHint`, `goOverlay` (ปุ่มหัว + ลิงก์เช็กลิสต์),
`backToDashboard`, `chartBarTitle` (`{date} · {amount}`)
คีย์ที่เลิกใช้: `totalReceived`, `tipsCount`, `setupPromptpayWarning` — **ลบออกทั้ง th/en**
(`pendingCount` เช็กก่อนว่าไม่มีใครใช้ที่อื่น ถ้าไม่มีก็ลบด้วย)

## สิ่งที่ตั้งใจไม่ทำ

- ไม่ทำเรียงลำดับรายการทิป (Steam มี sort order — ของเรายังไม่จำเป็น) · ไม่ทำเลือกวันเอง · ไม่ส่งออก CSV
- ไม่ทำกราฟรายเดือนสำหรับ "ทั้งหมด" · ไม่ทำกราฟรายชั่วโมงสำหรับ "วันนี้"
- ไม่แก้ `OverlaySettings` (รวมถึงปุ่มพับ/กางที่ไร้ประโยชน์เมื่ออยู่หน้าเดี่ยว — ค่อยว่ากันใน D หรือหลังจากนั้น)
- ไม่แตะ settings page (นั่นคือ D)

## การทดสอบ

1. `range.ts`: สคริปต์ `tsx` ใน scratchpad พิมพ์ผล (โปรเจกต์ไม่มี test runner — ไม่เพิ่ม dependency) —
   `bangkokDayStart(2026-09-14T20:30Z)` = `2026-09-14T17:00Z` (คือ 15 ก.ย. 00:00 ไทย) ·
   `dayBuckets("7d", …)` ยาว 7 ลงท้ายด้วยวันนี้(ไทย) · `parseRange("x")` = `"7d"` · `parseRange(["30d"])` = `"30d"`
2. `tsc` · `build` · `lint` **คงที่ 5**
3. **หน้าโดเนท `/th/lig_1569` และ `/th/nongmewtumarai`**: อันดับผู้สนับสนุน 5 แถว ชื่อ+ยอด**เท่าเดิมทุกตัว**
   (จดค่าก่อนแก้ไว้ก่อน)
4. **แดชบอร์ด** (ล็อกอินเป็นผู้ใช้เอง): ค่าเริ่มต้น = 7 วัน · กด 4 ปุ่มแล้ว URL/ตัวเลข/กราฟเปลี่ยน ·
   `?range=xyz` → 7 วัน · `ทั้งหมด` ยอดรับ = ยอดที่ยืนยันแล้วเดิมก่อนแก้ · กราฟ 7 แท่ง / 30 แท่ง ·
   `.card` บนหน้า = จำนวน TipRow + ReportForm (+ noTips ถ้าไม่มีทิป) เท่านั้น
5. เช็กลิสต์: ผู้ใช้เองครบ 3 → ไม่แสดง · ทดสอบ state ไม่ครบด้วยการ render component ตรงๆ หรือบัญชีทดสอบ
   (ห้ามแก้ข้อมูลผู้ใช้จริงบน prod เพื่อทดสอบ)
6. `/th/dashboard/overlay`: กด "แสดง URL overlay" ได้ · ลิงก์กลับใช้ได้ · เข้าโดยไม่ล็อกอิน → login
7. มือถือ 375: ไม่มี scroll แนวนอน · ปุ่มช่วงเวลา wrap ลงบรรทัดใหม่ได้ · dark mode ทั้งสองหน้า · console ไม่มี error
