# Goal bar: เริ่มรอบใหม่ + เปอร์เซ็นต์เกิน 100

วันที่: 2026-09-14 · สถานะ: รอผู้ใช้รีวิว

## ปัญหา

Goal bar (หน้าโปรไฟล์ + overlay บนจอไลฟ์) นับ **ยอดทิปสะสมตลอดกาล** เทียบกับเป้า
และตัดเปอร์เซ็นต์ที่ 100 ผลคือ:

- ถึงเป้าแล้วแถบค้าง 100% ตลอดไป ทางเดียวที่ "เริ่มใหม่" คือไปตั้งเป้าให้สูงขึ้น ซึ่งไม่ใช่สิ่งที่ครีเอเตอร์ต้องการ
- ทิปที่เข้ามาหลังถึงเป้าไม่สะท้อนออกมาเลย ทั้งที่คนดูเพิ่งโดเนท

## สิ่งที่ต้องได้

1. ถึงเป้าแล้ว **ตัวเลขวิ่งต่อ** 100 → 120 → 150% ไปเรื่อยๆ จนกว่าครีเอเตอร์จะกดเริ่มรอบใหม่
2. **แถบเติมค้างเต็มที่ 100%** ไม่ล้นออกนอกกล่อง
3. ปุ่ม **"เริ่มรอบใหม่"** ในหน้าตั้งค่า → ยอดกลับเป็น 0 **เป้าเดิม ชื่อเดิม**
4. **ทิปเก่าไม่ถูกแตะ** — รายการทิป, leaderboard, ยอดรวมในแดชบอร์ด, ฐานข้อมูล ทุกอย่างเหมือนเดิม เปลี่ยนแค่ตัวเลขบน goal bar
5. ครีเอเตอร์เก่าที่ไม่เคยกด ต้องเห็นเหมือนเดิมทุกประการ

## ดีไซน์

### ข้อมูล

เพิ่มฟิลด์เดียวใน `User` (`prisma/schema.prisma`):

```prisma
// When the current goal round started. Null = count every confirmed tip
// (the behaviour before this field existed, so old creators are unaffected).
goalStartedAt DateTime?
```

เลือกเก็บ **เวลา** ไม่ใช่ **ยอดหักลบ**: ยอดถูกคำนวณสดจากทิปที่มีอยู่ทุกครั้ง
ดังนั้นทิปที่ถูกปฏิเสธ/ลบทีหลังก็ยังให้ผลถูกต้อง และไม่มีทางเพี้ยนย้อนหลัง

### การนับยอด — ฟังก์ชันเดียว ใช้ 2 ที่

สร้าง `src/lib/goal.ts`:

```ts
/** Sum of confirmed tips that count toward the creator's CURRENT goal round. */
export async function goalRaised(creatorId: string, goalStartedAt: Date | null): Promise<number>
```

`where` ประกอบด้วย conditional spread เพื่อไม่ส่งฟิลด์ที่ไม่มีค่าเข้า Prisma:

```ts
where: {
  creatorId,
  status: "CONFIRMED",
  ...(goalStartedAt ? { confirmedAt: { gte: goalStartedAt } } : {}),
}
```

ผู้เรียก 2 จุด — ทั้งคู่ต้อง `select: { goalStartedAt: true }` เพิ่ม:

| ที่ | ปัจจุบัน | เปลี่ยนเป็น |
|---|---|---|
| `src/app/[locale]/[username]/page.tsx` | `prisma.tip.aggregate(...)` ใน `Promise.all` (ตัวแปร `confirmedAgg`) | `goalRaised(creator.id, creator.goalStartedAt)` — ตัว aggregate เดิม**ใช้กับ goal bar อย่างเดียว** (ตรวจแล้ว: `raised` ใช้แค่บรรทัด 192 กับ 317) จึงแทนได้ตรงๆ |
| `src/app/api/overlay/[username]/goal/route.ts` | `prisma.tip.aggregate(...)` | `goalRaised(user.id, user.goalStartedAt)` |

### เปอร์เซ็นต์

ทั้ง 2 จุดข้างบน: เอา `Math.min(100, …)` ออกจากตัวเลข `pct`
ความกว้างแถบ clamp แยกตอน render:

- หน้าโปรไฟล์ `width: \`${Math.min(100, goalPct)}%\``
- `GoalOverlayClient.tsx` `width: \`${Math.min(100, Math.max(goal.pct, 4))}%\`` (มี `Math.max(…, 4)` เดิมอยู่แล้ว)

### การกดเริ่มรอบใหม่ — API

`POST /api/overlay/asset` เพิ่ม `kind === "goalReset"` ตามแพตเทิร์นของ `goalSet` / `goalToggle`:

```ts
if (kind === "goalReset") {
  const startedAt = new Date();
  await prisma.user.update({
    where: { id: session.user.id },
    data: { goalStartedAt: startedAt },
  });
  return NextResponse.json({ ok: true, goalStartedAt: startedAt.toISOString() });
}
```

สิทธิ์: route นี้เช็ก session ก่อน dispatch อยู่แล้ว ไม่ต้องเพิ่ม

**ไม่เรียก `revalidatePath`** — ตรวจแล้วว่าข้อมูล goal ไม่ผ่าน page cache:
หน้าโปรไฟล์เป็น dynamic (ไม่มี cache directive, build = `ƒ`) และ goal bar บนจอไลฟ์
poll API ทุก 5 วินาที (`GoalOverlayClient.tsx:52`) `goalSet`/`goalToggle` เดิมก็ไม่เรียก
และเห็นผลสดอยู่แล้ว การใส่จะเป็นโค้ดตายที่ชวนเข้าใจผิด

### หน้าตั้งค่า — `src/components/OverlaySettings.tsx` ส่วน goal

`/api/overlay/setup` ต้องคืน `goalStartedAt` (ISO string หรือ null) เพิ่ม
เพื่อให้ component รู้ว่ารอบปัจจุบันเริ่มเมื่อไหร่

เพิ่มในส่วน goal (ใกล้ปุ่มบันทึกที่มีอยู่):

- **ปุ่ม "เริ่มรอบใหม่"** — แสดงเฉพาะเมื่อ `hasGoal` เป็นจริง
  - กดแล้ว `confirm()` ก่อน เพราะผลขึ้นจอไลฟ์ทันที กดพลาดคนดูเห็น
  - ระหว่างยิง API: state `resettingGoal` + `disabled` กันกดซ้ำ (ทำแบบเดียวกับ `savingGoal` ที่มีอยู่)
  - สำเร็จ: เก็บ `goalStartedAt` ใหม่ลง state, เรียก `setGoalRefresh(n => n + 1)` ให้ preview รีโหลดเหมือน `saveGoal`
- **ข้อความใต้ฟอร์ม** — ถ้า `goalStartedAt` มีค่า: *"นับตั้งแต่ {วันเวลา}"* ใช้ `formatDate()` จาก `src/lib/format.ts`
  (component เป็น client และค่ามาจาก fetch หลัง mount → ฟอร์แมตด้วย timezone ของเบราว์เซอร์ ไม่มี hydration mismatch)
  ถ้าเป็น null ไม่แสดงอะไร (= นับทั้งหมด เหมือนเดิม)

ข้อความใหม่ใน `messages/th.json` + `messages/en.json` (namespace `dashboard`):

| key | th | en |
|---|---|---|
| `obsGoalReset` | เริ่มรอบใหม่ | Start a new round |
| `obsGoalResetting` | กำลังล้าง… | Resetting… |
| `obsGoalResetConfirm` | เริ่มรอบใหม่? ยอดบน goal bar จะกลับเป็น 0 ทันที (ทิปเก่าไม่หายไปไหน) | Start a new round? The goal bar drops to 0 right away (your past tips are untouched). |
| `obsGoalSince` | นับตั้งแต่ {date} | Counting since {date} |

## สิ่งที่ตั้งใจไม่ทำ

- เอฟเฟกต์ฉลองตอนถึงเป้า
- ประวัติรอบที่ผ่านมา / "เป้าที่เคยถึง"
- ตั้งเป้าใหม่พร้อมกับล้างในคลิกเดียว
- ปุ่มล้างบน overlay เอง (เป็น browser source ใน OBS กดไม่ได้อยู่แล้ว)

ยังไม่มีใครขอ และข้อมูลที่เก็บ (เวลา) รองรับการทำทีหลังได้โดยไม่ต้อง migrate ซ้ำ

## Deploy

- Migration เป็นคอลัมน์ใหม่ nullable → ปลอดภัย ไม่ต้อง backfill
- Vercel `build` = `prisma generate && next build` **ไม่รัน migrate** → ต้องรัน
  `npx prisma migrate deploy` กับฐานข้อมูลก่อน/พร้อม push (ตามที่ทำมา 27 migrations)
- ลำดับปลอดภัย: migrate ก่อน แล้วค่อย push โค้ด (โค้ดเก่าไม่รู้จักคอลัมน์ใหม่ก็ไม่เป็นไร แต่โค้ดใหม่บนคอลัมน์ที่ยังไม่มีจะพัง)

## การทดสอบ

โปรเจกต์ไม่มี test suite → ตรวจด้วยเครื่องมือ + dev server จริง
ฐานข้อมูลเป็นตัวจริง ใช้บัญชี `lig_1569` (ของผู้ก่อตั้งเอง) เท่านั้น

1. `npx tsc --noEmit` และ `npm run build` ผ่าน · `npm run lint` error คงที่ 5 (ของเดิม)
2. **ก่อนกดล้าง** — จด: ยอด goal บนโปรไฟล์, จำนวนแถวใน leaderboard, จำนวนทิปในแดชบอร์ด
3. **กดล้าง** ในหน้าตั้งค่า → ต้องมี confirm → ปุ่ม disabled ระหว่างรอ → ข้อความ "นับตั้งแต่ …" โผล่เป็นเวลาไทย
4. **หลังกดล้าง** — goal บนโปรไฟล์ = ฿0 / 0% · **leaderboard และรายการทิปเหมือนข้อ 2 เป๊ะ** · `GET /api/overlay/lig_1569/goal?key=…` คืน `raised: 0, pct: 0`
5. **เปอร์เซ็นต์เกิน 100** — ตั้งเป้าชั่วคราวให้ต่ำกว่ายอดที่มี (เช่น ฿10 บนยอด ฿68) → โปรไฟล์และ API ต้องแสดง `680%` และแถบกว้าง 100% พอดี ไม่ล้น · ตั้งเป้ากลับหลังทดสอบ
6. **ครีเอเตอร์เก่าไม่กระทบ** — เปิดโปรไฟล์คนที่ไม่เคยกดล้าง (เช่น `nongmewtumarai`) ยอด goal ต้องเท่าเดิม
