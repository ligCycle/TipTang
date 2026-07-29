# TipTang — ภาพรวมโปรเจกต์

> เอกสารนี้มีไว้ให้ใครก็ตาม (รวมถึง AI chat session ใหม่) อ่านแล้วเข้าใจได้เลยว่า
> โปรเจกต์นี้คืออะไร มีอะไรบ้าง และมีข้อควรระวังอะไรตอนแก้โค้ด

## 1. คืออะไร (Elevator pitch)
**TipTang** (tiptang.com) = แพลตฟอร์มรับ **ทิป/โดเนท** สำหรับครีเอเตอร์และสตรีมเมอร์ไทย
ผ่าน **PromptPay QR + อัปสลิป** — **ฟรี 0% ไม่หักค่าธรรมเนียม เงินเข้าบัญชีตรง**
คล้าย TipMe / Tipme.in.th แต่ไม่หักเปอร์เซ็นต์ และมี overlay สำหรับ OBS ครบ

**บริบทธุรกิจ:** TipMe (เจ้าตลาดเดิม) กำลังปิดตัว (PromptPay ดับตั้งแต่ มิ.ย. 2026, ปิดถาวร 31 ส.ค. 2026)
→ ครีเอเตอร์ต้องหาที่ใหม่ = ช่วงชิงตลาดของ TipTang. งานหลักตอนนี้คือ **หา user (outreach หาครีเอเตอร์)** ไม่ใช่ฟีเจอร์
(บันทึกกลยุทธ์/รายชื่อ lead อยู่ใน Claude memory ไม่ได้อยู่ใน repo)

## 2. Tech stack (เวอร์ชันจริง)
- **Next.js 16.2.10** (App Router) + **React 19.2.4** + **TypeScript 5**
- **Prisma 7.8** + **PostgreSQL** (โฮสต์บน **Supabase**) ผ่าน `@prisma/adapter-pg`
- **Auth.js v5** (`next-auth` 5 beta) — session แบบ **JWT**, Credentials (email/password, bcrypt) + **Google OAuth**
- **next-intl 4.13** — 2 ภาษา **th / en** (`messages/th.json`, `messages/en.json`)
- **Tailwind CSS v4** (`@theme`, dark mode แบบ manual ผ่าน `data-theme`)
- **Supabase Storage** — เก็บรูป (avatar/cover/slip/alert asset)
- **promptpay-qr** + **qrcode** — สร้าง PromptPay QR
- **zod 4** (validation), **nodemailer** (reset password email), **@upstash/ratelimit** (rate limit, มี in-memory fallback), **@vercel/analytics**
- Deploy: **Vercel** (Hobby, push `main` → auto-deploy)

## 3. Data model (Prisma — `prisma/schema.prisma`)
- **User** — ครีเอเตอร์ 1 คน = 1 บัญชี. ฟิลด์เด่น: `username`/`displayName`/`bio`/`avatarUrl`/`coverUrl`,
  `promptpayId` (⚠️ SENSITIVE PDPA — ห้าม expose สู่ public), `passwordHash?` (null = สมัครผ่าน Google),
  `googleId?`, `socialLinks` (JSON), สีธีม (`profileColor`/`alertColor`/`goalColor`/`timerColor`),
  ตั้งค่า overlay (`overlayKey` ลับ, alert sound/image/video/style, `bigTipThreshold`, `ttsEnabled`),
  goal bar (`goalTitle`/`goalAmount`/`goalOverlayEnabled`), subathon timer, `autoConfirmTips`
- **Tip** — 1 การโดเนท: `supporterName`/`message`/`amount`/`slipUrl`/`status` (PENDING/CONFIRMED/REJECTED),
  `transRef` (unique — กันสลิปซ้ำ), `autoVerified`, `verifyCode`/`verifyDetail` (ผลสกรีนสลิป)
- **ShopItem / ShopOrder** — ร้านขายของ/คอมมิชชัน จ่ายผ่าน PromptPay+สลิปเหมือน Tip
- **AlertAsset** — คลังเสียง/สติกเกอร์แบบสุ่มของ overlay (many per creator)
- **Review** — รีวิวเว็บ (social proof หน้า landing, admin อนุมัติ)
- **Report** — ครีเอเตอร์แจ้งปัญหา/ข้อเสนอถึง admin
- **PasswordResetToken** — เก็บ SHA-256 hash ของ token (raw token ส่งอีเมล ไม่เก็บ)

## 4. ฟีเจอร์ / เส้นทางหลัก (routes อยู่ใน `src/app`)
**Public**
- `/[locale]` — **landing** (hero, วิธีใช้, ฟีเจอร์, ตารางเทียบ, **FAQ**, รีวิว)
- `/[locale]/[username]` — **หน้าโปรไฟล์ครีเอเตอร์** + ฟอร์มโดเนท (โชว์ QR + อัปสลิป)
- `/[locale]/start` — คู่มือเริ่มต้น 5 นาที (สมัคร → ตั้งพร้อมเพย์ → OBS → แชร์ลิงก์)
- `/[locale]/terms`, `/[locale]/privacy` — PDPA

**Auth** — `/login`, `/register`, `/forgot-password`, `/reset-password`

**Dashboard (ต้องล็อกอิน)**
- `/dashboard` — รายการทิป (สถานะ + verdict สลิป, ปุ่มลบ/เคลียร์ที่ปฏิเสธ, auto-refresh)
- `/dashboard/settings` — โปรไฟล์, พร้อมเพย์, รูป, โซเชียล, สีธีม, `autoConfirmTips`,
  ตั้งค่า overlay (alert/goal/timer/TTS), **ผูกบัญชี Google (Connected accounts)**
- `/dashboard/shop` — จัดการร้าน

**Admin** — `/admin` (โมเดอเรตรีวิว + ดู report) จำกัดด้วย env `ADMIN_EMAIL`

**OBS Overlay** (อยู่ **นอก** `[locale]` ไม่มี i18n, ยืนยันตัวด้วย `overlayKey`)
- `/overlay/[username]` — แจ้งเตือนโดเนทขึ้นจอ (เสียง/รูป/วิดีโอ/สี/แอนิเมชัน + confetti ทิปก้อนใหญ่ + TTS อ่านออกเสียง)
- `/overlay/[username]/goal` — แถบเป้าหมาย
- `/overlay/[username]/timer` — นาฬิกา subathon (โดเนทเพิ่มเวลา)

**API** (`src/app/api/*`) — register, auth, profile(+image), `qr` (สร้าง PromptPay QR),
tips (สร้าง/ลบ), overlay(setup/asset/goal/timer), tts, reviews, reports, shop(items/orders), uploads

**การยืนยันสลิป** (`src/lib/slip-verify.ts`) — provider ตั้งผ่าน env (`gemini`/`slipok`/`easyslip`);
default Gemini = `gemini-2.5-flash` (OCR อ่านสลิป ไม่ใช่เช็คฝั่งธนาคาร, fail-safe → ไม่ชัวร์ = คง PENDING).
`autoConfirmTips` ON = Gemini ยืนยันเฉพาะใบที่ตรง (`verifyCode==="match"`), ใบน่าสงสัยค้าง+ติดธงให้ตรวจเอง

## 5. ข้อควรระวังตอนแก้โค้ด (Architecture gotchas)
- ⚠️ **"This is NOT the Next.js you know"** (ดู `AGENTS.md`) — Next 16 มี breaking changes เยอะ
  **อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ดที่แตะ API ของ Next เสมอ**
- **Next 16:** `params` / `searchParams` เป็น **Promise** → ต้อง `await`; หน้า i18n ต้อง `setRequestLocale(locale)`
- **Prisma 7:** ไม่มี `url` ใน `datasource` → ใช้ `prisma.config.ts` + `PrismaPg` adapter; migrate ใช้ `DIRECT_URL`
  (workflow: แก้ schema → เขียน `migration.sql` เอง (UTF-8) → `npx prisma migrate deploy` + `npx prisma generate`)
- **Auth.js v5:** session = **JWT** (ไม่ใช้ Prisma adapter), Credentials + Google (push provider แบบมีเงื่อนไขเมื่อ env ครบ),
  upsert User เอง; jwt callback query DB เฉพาะตอน sign-in ครั้งแรก. Google callback: `/api/auth/callback/google`
- **Tailwind v4:** brand ramp กลับด้านใน dark mode (`brand-900` = ชมพูอ่อนใน dark) → ระวัง `text-brand-900`
  บนพื้นขาว hardcode จะอ่านไม่ออกใน dark
- **Middleware** (`src/middleware.ts`): next-intl ครอบทุก path ยกเว้นที่อยู่ใน matcher negative-lookahead
  (`api`, `overlay`, `opengraph-image`, `_next`, `_vercel`, ไฟล์มีนามสกุล) — route ใหม่ที่อยู่นอก `[locale]`
  และไม่มีนามสกุล **ต้องเพิ่มใน matcher** ไม่งั้นโดน redirect ไปใส่ locale = 404
- **Storage** (`src/lib/storage.ts`): driver `supabase` (prod) หรือ `local` (offline dev)
- **OG image**: `src/app/opengraph-image.tsx` ใช้ Satori (default font รองรับ **Latin เท่านั้น ไม่รองรับไทย**)
  → ข้อความบนรูปเป็นอังกฤษ, ข้อความขายไทยอยู่ใน OG description (`src/app/layout.tsx`)

## 6. Deploy & โครงสร้าง env
- push `main` → **Vercel auto-deploy**. Function timeout ~10s, มี cold start ตอนไม่มีคนใช้
  (มี UptimeRobot ping ทุก 5 นาทีให้เว็บอุ่นอยู่ → dashboard ไม่ช้า)
- env สำคัญ (ดู `.env.example` ครบ): `DATABASE_URL`/`DIRECT_URL`, `AUTH_SECRET`,
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (ปุ่ม Google โผล่เมื่อครบทั้งคู่),
  `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_BUCKET`,
  `SLIP_VERIFY_PROVIDER`+`GEMINI_API_KEY`, `ADMIN_EMAIL`, (optional) SMTP/Resend, Upstash Redis

## 7. เช็คงานก่อน deploy
- **`next build` และ `npm run dev` รันไม่ได้บนเครื่องนี้** (Smart App Control บล็อก `@swc/core` — อย่าปิด SAC)
  → ตรวจด้วย **`npx tsc --noEmit`** แล้วพึ่ง Vercel build จริง / verify บน production หลัง deploy
- i18n: เพิ่ม key ต้องครบทั้ง `th.json` และ `en.json` (จำนวน key เท่ากัน) ไม่งั้นขึ้น raw key

---
สถานะ: **MVP ใช้งานจริงแล้ว** (มี user จริงกำลังทดลองใช้). โฟกัสถัดไป: outreach หาครีเอเตอร์ + ลด friction ตอน onboard
