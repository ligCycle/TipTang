# รูปสลิปเป็นส่วนตัว: bucket private + signed URL เฉพาะเจ้าของทิป

วันที่: 2026-09-16 · สถานะ: อนุมัติในแชท

## ปัญหา

`uploadImage(file, "slips")` อัปโหลดสลิปเข้า bucket **public** เดียวกับรูปโปรไฟล์ แล้วเก็บ public URL ใน `Tip.slipUrl` ·
ใครมีลิงก์ก็เปิดได้โดยไม่ล็อกอิน ตลอดกาล · สลิปมีชื่อ/บัญชีผู้โอน และชื่อ/พร้อมเพย์ครีเอเตอร์ → ขัดกับนโยบายความเป็นส่วนตัว
ที่บอกว่าไม่เปิดเผยพร้อมเพย์ต่อสาธารณะ · นอกจากนี้ลบทิปแล้วไฟล์สลิปยังค้างใน storage

## สิ่งที่ต้องได้

1. ทิปใหม่: สลิปเข้า bucket **private** `slips` (env `SUPABASE_SLIP_BUCKET`, default `"slips"`) · DB เก็บ **key** ใน `Tip.slipKey`
   · `slipUrl` = null
2. ดูสลิปได้ทาง `GET /api/tips/[id]/slip` เท่านั้น: ต้องล็อกอิน (401) + เป็นเจ้าของทิป (ไม่ใช่ → 404 ไม่ยืนยันว่าทิปมีอยู่)
   → 302 ไป signed URL อายุ **60 วิ** · ไม่ตั้ง `download` (เปิด inline)
3. ทิปเก่าที่ยังมี `slipUrl` (legacy public) ยังเปิดได้เหมือนเดิมจนกว่าจะย้าย — หน้าจอไม่พังระหว่างเปลี่ยน
4. สคริปต์ย้ายของเก่า `scripts/migrate-slips.ts`: ทีละไฟล์ (`for…of`, ไม่ `Promise.all`) · **dry-run เป็นค่าเริ่มต้น** ต้องใส่ `--apply`
   · ต่อไฟล์: ดาวน์โหลดจาก public → อัปโหลด private (key เดิม) → `update slipKey, slipUrl=null` → ลบไฟล์ public · log ทุกบรรทัด ·
   ข้ามรายการที่ URL ไม่ใช่ของ bucket เรา (local dev)
5. ลบทิป (เดี่ยว/ล้างที่ปฏิเสธ) → ลบไฟล์สลิปด้วย (best-effort ไม่ทำให้ request ล้ม) ทั้ง `slipKey` และ legacy `slipUrl`
6. ตัวตรวจสลิป (`verifySlip(file)`) รับไฟล์อยู่แล้ว — ไม่แตะ · `TipRow` ไม่แตะ (รับ href ที่หน้าหลักคำนวณให้)
7. ไม่แตะ: สลิปร้านค้า (`shop/orders` — `SHOP_ENABLED=false`), รูปโปรไฟล์/overlay (ต้อง public), local dev driver
   (key แบบเดียวกัน แต่ signed URL = `/api/uploads/<key>` เดิม)
8. lint คงที่ 5 · migration hand-written ตาม PROJECT.md · branch แยก ไม่ push จนกว่าผู้ใช้ทดสอบ

## ดีไซน์

### DB — `prisma/migrations/20260916000000_add_tip_slip_key/migration.sql`
```sql
-- Slips move to a PRIVATE bucket. slipKey holds the storage object key and is
-- served through /api/tips/[id]/slip (owner-only signed URL). slipUrl stays for
-- rows that have not been migrated yet; scripts/migrate-slips.ts moves them.
ALTER TABLE "Tip" ADD COLUMN     "slipKey" TEXT;
```
schema: `slipKey String?` ใต้ `slipUrl`

### `src/lib/storage.ts` (เพิ่ม ไม่แก้ของเดิม)
```ts
const SLIP_BUCKET = process.env.SUPABASE_SLIP_BUCKET || "slips";
export async function uploadSlip(file: File): Promise<string>        // → key "slips/<uuid>.<ext>"
export async function signedSlipUrl(key: string, expiresIn = 60): Promise<string>
export async function deleteSlip(key: string | null | undefined): Promise<void>   // best-effort
```
- supabase: `.from(SLIP_BUCKET).upload(key, bytes, { contentType, upsert:false })` · `createSignedUrl(key, expiresIn)` (ไม่มี download)
- local: เขียนที่ `LOCAL_DIR/<key>` · signed = `/api/uploads/<key>`
- `deleteFile(url)` เดิมยังใช้กับ legacy `slipUrl`

### `POST /api/tips` — `const slipKey = await uploadSlip(slip)` → `data: { slipKey }` (ไม่มี `slipUrl`)

### `GET /api/tips/[id]/slip/route.ts`
```ts
const user = await requireUser(); if (!user) 401
const tip = await prisma.tip.findUnique({ where:{id}, select:{ creatorId, slipKey, slipUrl } });
if (!tip || tip.creatorId !== user.id) 404
if (tip.slipKey) return NextResponse.redirect(await signedSlipUrl(tip.slipKey, 60), 302);
if (tip.slipUrl) return NextResponse.redirect(tip.slipUrl, 302);   // legacy จนกว่าจะย้าย
404
```
`export const dynamic = "force-dynamic"` · header `Cache-Control: no-store`

### หน้าหลัก `dashboard/page.tsx`
select เพิ่ม `slipKey` · `slipUrl: tip.slipKey || tip.slipUrl ? \`/api/tips/${tip.id}/slip\` : null` — **ทุกทิปที่มีสลิปวิ่งผ่าน route เดียว**
(legacy ก็ผ่าน route → ได้ ownership check ฟรี แม้ยังไม่ย้าย)

### ลบทิป
- `DELETE /api/tips/[id]`: select เพิ่ม `slipKey, slipUrl` → หลัง `delete` → `after(() => { deleteSlip(slipKey); deleteFile(slipUrl); })`
- `DELETE /api/tips` (ล้างที่ปฏิเสธ): `findMany` keys/urls ก่อน → `deleteMany` → `after(...)` ลบทีละไฟล์

### `scripts/migrate-slips.ts`
รัน: `node --env-file=.env scripts/migrate-slips.ts` (dry-run) · `… --apply` (ทำจริง) · ใช้ `@prisma/client` + `PrismaPg` + `@supabase/supabase-js` ตรงๆ
· เลือก `tip where slipUrl not null and slipKey null` · marker `/object/public/<SUPABASE_BUCKET>/` → key · ทีละรายการ:
download → upload private (`upsert:true` เผื่อรันซ้ำ) → update DB → remove public · สรุปท้าย `moved / skipped / failed`
· ล้มรายการไหน log แล้วไปต่อ (ไม่ throw) · **ห้ามรันโดยไม่มีผู้ใช้อยู่** (แตะไฟล์+DB จริง)

### env
`.env.example` เพิ่ม `SUPABASE_SLIP_BUCKET="slips"` + คอมเมนต์ "private bucket — create it in Supabase Storage with Public OFF"
· ผู้ใช้เพิ่มใน `.env` และ **Vercel env** ก่อน deploy

## ทดสอบ
1. `tsc` · `build` · lint 5 · test 7
2. bucket `slips` ต้องมีอยู่และ private (ผู้ใช้สร้าง) — ถ้าไม่มี อัปโหลดทิปใหม่จะ error ชัด (ข้อความ Supabase)
3. ส่งทิปทดสอบ 1 รายการที่ `/th/lig_1569` (ยอด 1 บาท สลิปรูปอะไรก็ได้ — จะเป็น PENDING/unreadable) → DB มี `slipKey` และ `slipUrl` null
   → แดชบอร์ด "ดูสลิป" เปิดได้ (302 → signed URL → รูป) → `curl` route แบบไม่มี cookie → 401 → เปิด URL ตรงของ object ใน bucket private → 400 ·
   แล้ว**ลบทิปทดสอบ** → ไฟล์หายจาก bucket
4. ทิปเก่า: "ดูสลิป" ยังเปิดได้ผ่าน route (redirect ไป public URL เดิม)
5. `migrate-slips` dry-run แสดงรายการครบ ไม่แก้อะไร · `--apply` (ตอนผู้ใช้อยู่) → ทุกรายการ moved · เปิด "ดูสลิป" ทิปเก่าได้ · public URL เดิมเปิดไม่ได้แล้ว (404)
