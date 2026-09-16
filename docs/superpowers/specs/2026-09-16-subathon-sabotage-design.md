# Subathon "ลดเวลา" (sabotage): คนดูโดเนทเพื่อลดเวลาได้ · ครีเอเตอร์ตั้งกฎ

วันที่: 2026-09-16 · สถานะ: อนุมัติในแชท
(ผู้ใช้เลือก: C = คนดูเลือกทิศทาง + ครีเอเตอร์ตั้งขั้นต่ำ · อัตราลดแยกจากบวก (default แพงกว่า 2 เท่า) · มีพื้นต่ำสุด ฝั่งบวกไม่ติดพื้น
· **เพิ่มระหว่างทำ:** ตัวเลือกที่ 3 "แค่โดเนท" ไม่ยุ่งกับเวลา → `Tip.timerEffect = ADD | REDUCE | NONE` (default ADD) แทน boolean)

## ปัญหา / โอกาส

ตัวจับเวลา Subathon มีแต่ "บวก" — ทุกทิปที่ยืนยันเพิ่มเวลาตามอัตราเดียว · วงการ subathon มีลูกเล่น "sabotage" ให้คนดูจ่ายเพื่อ**ลด**เวลา
ทำให้เกิดการแข่งกันสองฝั่ง (tug-of-war) ยอดโดเนทรวมมักสูงขึ้น · ตอนนี้ระบบไม่มีแนวคิด "ทิศทาง" ในทิป และโค้ดบวกเวลามี race
(อ่าน → คำนวณ → เขียน ไม่ล็อก) ที่ทิปพร้อมกันอาจทับกัน

## สิ่งที่ต้องได้

1. **ครีเอเตอร์เปิด/ตั้งค่า** ในหน้า OBS overlay ใต้บล็อก Subathon (เห็นเมื่อ timer เปิด):
   `☐ ให้คนดูโดเนทเพื่อ "ลดเวลา" ได้` · อัตราลด `ทุกๆ [20] บาท = ลด [1] นาที` · ยอดขั้นต่ำที่ลดได้ `[20]` บาท · ลดได้ต่ำสุดเหลือ `[5]` นาที
   · บันทึกด้วยปุ่ม "บันทึกการตั้งค่า" เดิม (kind `timerConfig`)
2. **คนดูเลือกตอนโดเนท** — หน้ารับทิปโชว์ 3 ปุ่ม `เพิ่มเวลา | ลดเวลา | แค่โดเนท` เฉพาะเมื่อครีเอเตอร์ **เปิด timer และเปิด reduce** ·
   **default = เพิ่มเวลา เสมอ** (ตอนเปิดหน้าและหลังส่งสำเร็จ) · ใต้สวิตช์บอกอัตราทั้งสองฝั่ง + ขั้นต่ำ · เลือก "ลด" แต่ยอด < ขั้นต่ำ →
   ปุ่มสร้าง QR ปิด + ข้อความ · เก็บใน `Tip.timerEffect` (enum, default ADD)
3. **API ตรวจซ้ำ** (`POST /api/tips`): `timerReduce === "true"` รับได้ก็ต่อเมื่อ `timerEnabled && timerReduceEnabled && amount ≥ timerReduceMinAmount`
   ไม่ผ่าน → 400 `reduce_not_allowed` (ไม่แอบเปลี่ยนเป็นบวก)
4. **คำนวณ** (pure function ใน `src/lib/subathon-math.ts` + unit test):
   - บวก: `sec = round(amount × secPerUnit/bahtPerUnit)` · เดิน: `endsAt + sec` ไม่เกิน `now + cap` · พัก: `remaining + sec` ไม่เกิน `cap` · หยุด/หมดแล้ว: ไม่ทำ
   - ลด: `sec = round(amount × reduceSec/reduceBaht)` · เดิน: `max(endsAt − sec, now + floor)` — ถ้า `endsAt ≤ now + floor` อยู่แล้ว → ไม่เปลี่ยน ·
     พัก: `max(remaining − sec, floor)` · หยุด/หมดแล้ว: ไม่ทำ
   - เวลาที่เขียนลง DB ปัดเป็นวินาทีเต็ม
5. **กันทับกัน**: `applySubathonTip()` ทำใน `prisma.$transaction(async tx => …)` เริ่มด้วย `SELECT … FROM "User" WHERE id=$1 FOR UPDATE`
   แล้วค่อยคำนวณ/เขียนด้วย `tx` — ทิปพร้อมกันเข้าคิวต่อกัน ใช้กับ**ทั้งบวกและลด** (แก้ race เดิมด้วย)
6. **เห็นบนจอ**: alert overlay ใส่ป้ายเล็กใต้ยอด `⏬ −X นาที` (reduce) หรือ `⏫ +X นาที` (add, เฉพาะเมื่อ timer เปิด) — API alert คำนวณนาทีให้
   (`timerDelta: number | null` = วินาที บวก/ลบ, null เมื่อ timer ปิด) · นาฬิกา overlay ไม่แก้ (poll เวลาที่เหลืออยู่แล้ว) ·
   แดชบอร์ด TipRow ป้าย `ลดเวลา` สีส้มบนทิปที่ reduce
7. ทิปลดยัง**นับเป็นเงินปกติ** ทุกที่ (ยอดรวม / goal / อันดับ / อีเมล) — ต่างแค่ผลต่อนาฬิกา
8. ไม่ทำ: ลดถึง 0 · แก้ UI นาฬิกา OBS · ร้านค้า (ออเดอร์ = บวกเสมอ) · ประวัติกราฟเวลา
9. lint 5 · test เพิ่ม · migration hand-written · branch แยก ไม่ push

## ดีไซน์

### DB — `20260916100000_add_subathon_reduce/migration.sql`
```sql
-- Subathon "sabotage": viewers may pay to REDUCE the timer, on the creator's
-- terms. All defaults keep today's behaviour (feature off, tips add time).
ALTER TABLE "User" ADD COLUMN "timerReduceEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "timerReduceBahtPerUnit" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "User" ADD COLUMN "timerReduceSecondsPerUnit" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "User" ADD COLUMN "timerReduceMinAmount" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "User" ADD COLUMN "timerFloorSeconds" INTEGER NOT NULL DEFAULT 300;
ALTER TABLE "Tip" ADD COLUMN "timerReduce" BOOLEAN NOT NULL DEFAULT false;
```

### `src/lib/subathon-math.ts` (pure, tested)
```ts
export type TimerConfig = { bahtPerUnit; secondsPerUnit; maxSeconds: number|null;
  reduceBahtPerUnit; reduceSecondsPerUnit; floorSeconds };
export type TimerState = { endsAtMs: number|null; remaining: number|null };   // running | paused | stopped
export function tipSeconds(amount, bahtPerUnit, secondsPerUnit): number   // round, ≥0
export function nextTimerState(state, cfg, amount, reduce, nowMs): TimerState | null   // null = no change
```
`nextTimerState` คืน `{ endsAtMs }` (running) หรือ `{ remaining }` (paused) เป็นวินาทีเต็ม · เคสที่ต้อง test:
บวกเดิน/บวกพัก/บวกชนเพดาน/ลดเดิน/ลดพัก/ลดชนพื้น/ลดเมื่อต่ำกว่าพื้นอยู่แล้ว(null)/หมดแล้ว(null)/หยุด(null)/ยอดต่ำจน sec=0(null)

### `src/lib/subathon.ts`
`addSubathonTime` → `applySubathonTip(creatorId, amount, reduce)` — `$transaction` + `FOR UPDATE` → `nextTimerState` → `tx.user.update`
· ผู้เรียก 2 จุด: `POST /api/tips` (ยืนยันตอนมาถึง) และ `PATCH /api/tips/[id]` (กดยืนยัน) ส่ง `tip.timerReduce` · ออเดอร์ร้านค้า: `reduce=false`

### API
- `POST /api/tips`: อ่าน `form.get("timerReduce") === "true"` · select creator เพิ่ม `timerEnabled, timerReduceEnabled, timerReduceMinAmount` · ตรวจตามข้อ 3 · เก็บ `timerReduce`
- `POST /api/overlay/asset` kind `timerConfig`: รับเพิ่ม `reduceEnabled ("true"/"false")`, `reduceBahtPerUnit`, `reduceSecondsPerUnit`, `reduceMinAmount`, `floorSeconds` (clamp เหมือนของเดิม)
- `POST /api/overlay/setup`: คืน 5 ฟิลด์ใหม่
- `GET /api/overlay/[username]` (alert): select เพิ่ม `timerReduce` ของ tip + config ของ user → `timerDelta` (วินาที, ลบเมื่อ reduce, null เมื่อ timer ปิด)
- หน้ารับทิป (server): select creator เพิ่ม `timerEnabled, timerReduceEnabled, timerBahtPerUnit, timerSecondsPerUnit, timerReduceBahtPerUnit, timerReduceSecondsPerUnit, timerReduceMinAmount` → ส่ง prop `timerReduce` ให้ `TipForm` เฉพาะเมื่อเปิดทั้งคู่ ไม่งั้น `null`

### UI
- `TipForm`: prop `timerReduce?: { minAmount; addBaht; addMin; reduceBaht; reduceMin } | null` · state `reduce=false` · สวิตช์ 2 ปุ่ม (radio-like) ใต้ช่องจำนวนเงิน ·
  hint บรรทัดเดียว `ทุก {addBaht} บาท = +{addMin} นาที · ทุก {reduceBaht} บาท = −{reduceMin} นาที (ขั้นต่ำ {min} บาท)` · `reduce && amount < min` → ปุ่ม QR disabled + ข้อความ `reduceMinHint`
  · ส่ง `fd.set("timerReduce", …)` · `reset()` ตั้ง `reduce=false` · error map `reduce_not_allowed`
- `OverlaySettings` (บล็อก timer): toggle + 4 ช่อง ใต้ "เวลาสูงสุด" · state `tReduceOn, tRBaht, tRMin, tRMinAmt, tFloor` โหลดจาก setup · ส่งใน `saveTimerConfig`
- `OverlayClient` (alert): `timerDelta` → ป้าย `rounded-full bg-black/25 px-2 text-sm` ใต้ยอด: `⏬ −{m} นาที` / `⏫ +{m} นาที` (นาที = round(|sec|/60), ถ้า < 1 แสดง `<1`)
- `TipRow`: prop `timerReduce: boolean` → ป้าย `bg-orange-100 text-orange-700` "ลดเวลา" ข้าง status

### i18n
`profile`: `timerAdd` "⏫ เพิ่มเวลา"→ใช้ไอคอน ไม่ใช้ emoji บนเว็บ: `timerAdd` "เพิ่มเวลาไลฟ์", `timerReduce` "ลดเวลาไลฟ์", `timerRateHint` "ทุก {addBaht} บาท = +{addMin} นาที · ทุก {reduceBaht} บาท = −{reduceMin} นาที (ขั้นต่ำ {min} บาท)",
`timerReduceMin` "ลดเวลาต้องโดเนทอย่างน้อย {min} บาท", `timerChoiceLabel` "ทิปนี้ให้…"
`dashboard`: `obsReduceToggle` "ให้คนดูโดเนทเพื่อ \"ลดเวลา\" ได้", `obsReduceHint` "คนดูจะเลือกได้ว่าทิปนี้เพิ่มหรือลดเวลา — ตั้งอัตราลดให้แพงกว่าเพิ่ม ฝั่งเชียร์จะได้เปรียบ",
`obsReduceRateLabel` "อัตราลดเวลา", `obsReduceMinLabel` "ยอดขั้นต่ำที่ลดได้ (บาท)", `obsFloorLabel` "ลดได้ต่ำสุดเหลือ (นาที)", `reduceBadge` "ลดเวลา"
`errors`: `reduceNotAllowed` "ตอนนี้ลดเวลาไม่ได้ (ปิดอยู่หรือยอดต่ำกว่าขั้นต่ำ)"
+ en ทั้งหมด · alert overlay ใช้ข้อความไทยตายตัวเหมือนส่วนอื่นของ OverlayClient ("นาที")

## ทดสอบ
1. `npm test` — เคส math ครบ · tsc · build · lint 5
2. migration (ขอก่อนรัน) · ค่า default ทำให้ระบบเดิมเหมือนเดิมเป๊ะ (feature ปิด, สวิตช์ไม่โผล่)
3. บัญชีผู้ใช้เปิด reduce ผ่านหน้า OBS overlay (ผู้ใช้กดเอง) → หน้า `/th/lig_1569` มีสวิตช์ default "เพิ่ม" · เลือกลด + ยอด 5 → ปุ่มปิด
4. API: `curl` reduce=true amount ต่ำ → 400 `reduce_not_allowed` · reduce=true ยอดผ่าน ตอน timer เดินอยู่ → เวลาลดถูกต้อง (ดูจาก `/api/overlay/[username]/timer`) · ไม่ทะลุพื้น · ทิปทดสอบลบทิ้งหลังจบ
5. ทิปพร้อมกัน 5 รายการ (curl ขนาน) → ผลรวมเวลาถูกต้อง ไม่มีทับกัน
6. alert overlay preview แสดงป้าย ± นาที · TipRow ป้าย "ลดเวลา"
