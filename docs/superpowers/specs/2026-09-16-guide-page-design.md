# หน้าคู่มือ `/start`: รู้สถานะล็อกอิน · ข้อความชี้ปุ่มให้ตรง · ลุคเดียวกับ landing ใหม่

วันที่: 2026-09-16 · สถานะ: อนุมัติในแชท (ผู้ใช้: "ทำหน้าคู่มือต่อทั้ง 4 ข้อ")

## ปัญหา (จากการตรวจ 2026-09-16)

1. หน้าเป็น static (`generateStaticParams`) → ไม่รู้ว่าใครล็อกอิน · คนกด "คู่มือ" จากเมนูคือครีเอเตอร์ที่สมัครแล้ว
   แต่เห็น "สมัครเลย" (ขั้น 1) และ "เริ่มเลย — สมัครฟรี" (ล่างสุด)
2. ขั้น 5 บอก `กดปุ่ม "ทดสอบ"` — ปุ่มจริงชื่อ "ทดสอบ/ดูตัวอย่าง" และอยู่ในหน้า OBS overlay ไม่ได้บอก
3. ข้อความ "(สำหรับผู้ที่สมัครสมาชิกแล้ว)" ใต้ปุ่มขั้น 2 ซ้ำซ้อน
4. ลุคเก่า: การ์ดขาว 6 ใบเรียงกัน ไม่เข้ากับ landing ที่เพิ่งทำ

## สิ่งที่ต้องได้

1. **login-aware** (หน้ากลายเป็น dynamic เหมือนหน้าอื่น — ลบ `generateStaticParams`, เรียก `auth()`):
   - ล็อกอินแล้ว: ขั้น 1 ไม่มีปุ่ม แต่มีป้าย `✓ ทำแล้ว` · ขั้น 2 ปุ่ม "ไปหน้าตั้งค่า" (เดิม) · ขั้น 3 เพิ่มปุ่ม "ไปหน้า OBS overlay" →
     `/dashboard/overlay` · ปุ่มล่างสุด "ไปที่หน้าหลัก" → `/dashboard`
   - ยังไม่ล็อกอิน: ขั้น 1 ปุ่ม "สมัครเลย" · ขั้น 2 **ไม่มีปุ่ม** (ยังไม่มีบัญชีให้ตั้งค่า — แทนที่ hint เดิม) · ขั้น 3 ไม่มีปุ่ม ·
     ปุ่มล่างสุด "เริ่มเลย — สมัครฟรี" → `/register`
2. ข้อความขั้น 5 (th/en): `กดปุ่ม "ทดสอบ/ดูตัวอย่าง" ในหน้า OBS overlay ดู alert เด้งขึ้นจอ แล้วเริ่มไลฟ์รับโดเนทได้เลย — …`
3. ลบคีย์ `guide.step2Hint` · เพิ่ม `guide.doneBadge` ("ทำแล้ว"/"Done"), `guide.step3Cta` ("ไปหน้า OBS overlay"/"Open OBS overlay"),
   `guide.ctaDashboard` ("ไปที่หน้าหลัก"/"Go to Home")
4. ลุคเดียวกับ landing (ใช้ CSS ที่มีแล้ว ไม่เพิ่ม):
   - หัว: eyebrow ไม่ต้อง · `h1 text-4xl font-extrabold tracking-tight` ชิดซ้าย + intro `max-w-2xl`
   - คำเตือนเปิดในเบราว์เซอร์: คงเป็นแถบ amber (มันคือคำเตือน) แต่บางลง `rounded-xl px-4 py-2.5`
   - ขั้นตอน: `<ol class="divide-y divide-brand-900/10">` ไม่มีการ์ด · แต่ละ `li` = `grid grid-cols-[3rem_1fr] gap-4 py-7`
     ซ้าย: เลข `01`–`05` `text-3xl font-black tabular-nums text-brand-900/15` · ขวา: `h2 text-xl font-bold` (ไม่มี "1." นำหน้า เพราะเลขอยู่ซ้ายแล้ว)
     + desc + children · ไอคอนเดิมไว้ในวงกลม `bg-brand-100 text-brand-600` ข้างหัวข้อ (inline-flex)
   - ปุ่มในขั้นตอน = `.pill pill-outline pill-plain` (เล็ก: `text-sm`) · ป้าย "ทำแล้ว" = `inline-flex gap-1 rounded-full bg-emerald-100 text-emerald-700 px-3 py-1 text-xs font-semibold` + `check-circle`
   - กล่อง OBS lead-in ในขั้น 3: คงเป็นกล่องอ่อน `bg-brand-50` แต่ `rounded-2xl` · รายการ 4 ข้อเดิม
   - "ทำไมต้อง TipTang": `.ink rounded-3xl p-6 sm:p-8` (เลือดหมูใน light ตามที่ตกลง) · h2 `text-2xl font-extrabold` · 3 แถว check-circle สี brand-400
   - CTA ล่างสุด: `.pill pill-brand` (มีลูกศร) กึ่งกลาง
   - `Reveal` เฉพาะกล่อง "ทำไม" + CTA (ขั้นตอนต้องเห็นทันที ไม่ต้องรอเลื่อน)
5. ไม่แตะ: หน้าอื่น, i18n namespace อื่น, CSS ใหม่ · SEO: `generateMetadata` เดิม, h1 เดียว, h2 ต่อขั้น

## ทดสอบ

1. `tsc` · `build` · lint **5** · test 7
2. ไม่ล็อกอิน (`fetch` แบบไม่มี cookie หรือ pane ที่ยังไม่ล็อกอิน): ขั้น 1 มีปุ่ม "สมัครเลย" · ขั้น 2/3 ไม่มีปุ่ม · ล่างสุด "เริ่มเลย — สมัครฟรี"
3. ล็อกอิน (ผู้ใช้ตรวจเอง หรือ pane หลังล็อกอิน): ขั้น 1 ป้าย "ทำแล้ว" ไม่มีปุ่ม · ขั้น 3 ปุ่ม "ไปหน้า OBS overlay" · ล่างสุด "ไปที่หน้าหลัก"
4. `.card` บนหน้า = 0 · มือถือ 375 ไม่ล้น · dark mode: `.ink` มีขอบ, แถบ amber อ่านได้ · `/en/start` ครบ
5. ไม่ push จนกว่าผู้ใช้ดู

## งาน (ลำดับ)

1. i18n th/en: แก้ `step5Desc`, ลบ `step2Hint`, เพิ่ม 3 คีย์ → validate JSON
2. เขียน `src/app/[locale]/start/page.tsx` ใหม่ตามด้านบน (import `auth`, `Reveal`, `Icon`)
3. tsc/lint/test · เปิดดูใน pane (ไม่ล็อกอิน) · commit · รายงาน
