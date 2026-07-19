# TipTang — เว็บรับทิปครีเอเตอร์ (คล้าย TipMe) · MVP

ให้แฟน ๆ สนับสนุนครีเอเตอร์ผ่าน **PromptPay QR + อัปโหลดสลิป** ครีเอเตอร์ยืนยันสลิปเองใน Dashboard รองรับ **ไทย/อังกฤษ** และมีระบบล็อกอิน

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS v4**
- **Prisma 7** + **PostgreSQL (Supabase)** ผ่าน driver adapter (`@prisma/adapter-pg`)
- **Auth.js (NextAuth v5)** — Credentials + JWT
- **next-intl** — i18n (th/en)
- **Supabase Storage** — เก็บสลิป (มี local driver สำรองสำหรับ dev)
- **promptpay-qr** + **qrcode** — สร้าง PromptPay QR (ฝั่ง server เท่านั้น)

## ตั้งค่า Supabase (ครั้งเดียว)

1. สร้างโปรเจกต์ที่ https://supabase.com (free tier)
2. **Connection strings** — Project Settings → **Database** → Connection string:
   - `DATABASE_URL` = **Transaction pooler** (พอร์ต `6543`, ต่อท้าย `?pgbouncer=true`) — ใช้ตอนรันแอป
   - `DIRECT_URL` = **Direct connection / Session pooler** (พอร์ต `5432`) — ใช้ตอน migrate
3. **API keys** — Project Settings → **API**:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL (เช่น `https://xxxx.supabase.co`)
   - `SUPABASE_SERVICE_ROLE_KEY` = service_role key (เก็บเป็นความลับ)
4. **Storage bucket** — Storage → New bucket ชื่อ `uploads` → ตั้งเป็น **Public**
5. คัดลอกค่าทั้งหมดไปใส่ในไฟล์ `.env` (ดูตัวอย่างที่ `.env.example`)

> **ทดลองแบบไม่ใช้ Supabase Storage:** ตั้ง `STORAGE_DRIVER="local"` ใน `.env` เพื่อเก็บสลิปในเครื่อง (โฟลเดอร์ `.uploads/`) เสิร์ฟผ่าน `/api/uploads`

## รันโปรเจกต์

```bash
npm install
npx prisma generate                  # สร้าง Prisma client
npx prisma migrate dev --name init   # สร้างตารางใน DB (ต้องตั้ง DIRECT_URL แล้ว)
npm run dev                          # http://localhost:3000
```

## Flow การใช้งาน

1. **สมัคร** ที่ `/register` → ตั้งชื่อลิงก์ (username)
2. ไป **ตั้งค่า** (`/dashboard/settings`) กรอก **PromptPay** (เบอร์ 10 หลัก หรือเลขบัตร 13 หลัก)
3. แชร์ลิงก์ `/(th|en)/<username>` ให้แฟน ๆ
4. แฟนกรอกจำนวน + ข้อความ → สแกน **PromptPay QR** จ่าย → อัปโหลดสลิป → ส่ง (สถานะ `PENDING`)
5. ครีเอเตอร์เห็นใน **Dashboard** → กดยืนยัน/ปฏิเสธ → ทิปที่ยืนยันแล้วขึ้นบนหน้าโปรไฟล์

## จุดออกแบบด้านความปลอดภัย

- **PDPA:** `promptpayId` อ่านฝั่ง server เท่านั้น — API `/api/qr` คืนแค่รูป QR ไม่เคยส่งเบอร์/เลขบัตรออก client
- **Ownership:** ยืนยัน/ปฏิเสธทิปได้เฉพาะเจ้าของ (เช็ก `creatorId === session.user.id` → 403)
- **อัปโหลด:** จำกัดสลิป ≤ 5MB + เฉพาะรูป (jpg/png/webp) + rate limit ต่อ IP

## Deploy (Vercel)

- ตั้ง env vars ทั้งหมดใน Vercel (ใช้ Supabase Storage — อย่าใช้ `STORAGE_DRIVER=local` บน prod)
- เพิ่ม `prisma generate` ใน build step (หรือ postinstall) เพื่อให้ client ถูกสร้างตอน deploy

## นอกขอบเขต MVP (ทำต่อได้)

ยืนยันสลิปอัตโนมัติ (SlipOK/EasySlip), payment gateway จริง (Omise/Stripe), Donation Alert (OBS), ระบบถอนเงิน
