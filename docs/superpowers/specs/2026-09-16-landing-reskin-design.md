# หน้า Landing: reskin แบบ "สตูดิโอ" (การ์ดเข้ม · แคปซูล · reveal เบาๆ) ในโทนชมพูของเรา

วันที่: 2026-09-16 · สถานะ: อนุมัติในแชท (ผู้ใช้เลือก: landing อย่างเดียว · โทนสีของเรา · แอนิเมชันระดับ 1 · แนวทาง A reskin ในที่เดิม)
ที่มา: ผู้ใช้ส่ง prompt ของเทมเพลต "Lumora" (GetLayers) มาถามว่าเอามาใช้ได้ไหม → ตกลงกันว่าเอา**ภาษาการออกแบบ**
(พื้นสว่าง + การ์ดเข้ม + accent เดียว + motion เบา) ไม่เอาเนื้อหา/รูป/โครง single-file/Lenis/loader/liquid-reveal

## ปัญหา

`/[locale]` (หน้าแรกที่คนแปลกหน้าเห็น) เป็นหน้าเดียวที่ยังเป็น "การ์ดขาวเรียงๆ" แบบเดิม: hero กลางจอ → 3 การ์ด →
การ์ดฟีเจอร์ → ตาราง → FAQ ในการ์ด → รีวิว · ไม่มีการเคลื่อนไหว · ดูเป็นเทมเพลต ไม่ "แพง" · ข้อความขายดีอยู่แล้ว
(0% / เข้าบัญชีตรง / OBS / เทียบเจ้าอื่น) — ปัญหาอยู่ที่ผิว ไม่ใช่เนื้อหา

## สิ่งที่ต้องได้

1. คง **6 section เดิม ลำดับเดิม เนื้อหาเดิม** (hero · ใช้งานอย่างไร · ทำไมต้อง TipTang · เปรียบเทียบ · FAQ · รีวิว)
   + เพิ่ม **แถบ CTA ปิดท้าย** 1 อัน · คีย์ i18n เดิมทุกตัวยังใช้ · เพิ่มคีย์ใหม่เท่าที่จำเป็น (ดูท้ายเอกสาร)
2. ภาษาการออกแบบใหม่ทั้งหน้า: **การ์ดเข้ม** (`.ink`) มุมโค้ง `rounded-3xl` · ปุ่ม **แคปซูล** มีวงกลมลูกศรท้าย (`.pill`) ·
   หัวข้อ `font-extrabold tracking-tight` · eyebrow "จุด + ข้อความ" · แถว `divide-y` แทนกล่องซ้อนกล่อง ·
   **`.card` ขาวบนหน้านี้เหลือ 0** (ยกเว้นข้างใน ReviewsSection ที่ไม่แตะ)
3. โทนสีของเรา: accent = `brand-500/600` (ชมพู) · พื้น/เส้น = โทเค็น brand เดิม · **dark mode ต้องดูดี**: การ์ดเข้มต้อง
   แยกจากพื้นมืดได้ (สีเข้มกว่านิด + ขอบขาว 10%)
4. แอนิเมชันระดับ 1 เท่านั้น:
   - หัวข้อ hero **ขึ้นทีละบรรทัดจากใต้ clip** ตอนโหลด (CSS keyframes, stagger 120ms) — ไม่มี loader ไม่มี delay ก่อนเห็นหน้า
   - section อื่น **เลื่อนขึ้น 24px + จาง** ครั้งเดียวเมื่อเลื่อนถึง (IntersectionObserver) — ไม่มี lib ใหม่
   - hover: ปุ่ม `scale 1.03` · การ์ด `-translate-y-1` · ลูกศรในปุ่ม `translate-x-0.5` — CSS transition
   - **ไม่มี**: Lenis/smooth-scroll, loader, liquid reveal, count-up, word-by-word
5. **ไม่มี JS → เนื้อหาแสดงครบ** (สถานะซ่อนก่อน reveal ใช้ได้เฉพาะเมื่อ `<html class="js">`) ·
   `prefers-reduced-motion: reduce` → ปิดแอนิเมชันทั้งหมดในบล็อกเดียว **เจาะจงคลาส** ไม่ใช่ `*`
6. Watermark ทุกจุด: `pointer-events-none select-none` + `aria-hidden` · อยู่หลังเนื้อหา
7. มือถือ 375: ไม่มี scroll แนวนอน (วัด `scrollWidth`) · ตารางเปรียบเทียบยังเห็น **ทั้ง 3 คอลัมน์** (ไม่ซ่อนคอลัมน์คู่แข่ง)
   — ถ้าวัดแล้วล้น ค่อยหุ้ม `overflow-x-auto` เฉพาะตาราง
8. ไม่แตะ: `ReviewsSection`, `Header`, footer ใน layout, หน้าอื่น, API, DB · ไม่เพิ่ม dependency · ไม่เพิ่มรูปภาพ
9. SEO เท่าเดิม: `generateMetadata`, JSON-LD, `<h1>` เดียว, ลำดับหัวข้อ h1→h2→h3 ถูกต้อง

## ดีไซน์

### โทเค็น/ยูทิลิตี้ใหม่ใน `src/app/globals.css`

```css
/* การ์ดเข้ม — สีตายตัว ไม่ตามธีม (ชมพูบนเกือบดำคือจุดขายของลุค) */
.ink { background:#14090f; color:#fff; }
[data-theme="dark"] .ink { background:#1a0d14; border:1px solid rgba(255,255,255,.08); }

/* ปุ่มแคปซูล: ข้อความ + วงกลมลูกศรท้าย */
.pill { display:inline-flex; align-items:center; gap:.75rem; border-radius:9999px;
        padding:.375rem .375rem .375rem 1.5rem; font-weight:600; transition:transform .25s cubic-bezier(.2,.8,.2,1); }
.pill:hover { transform:scale(1.03); }
.pill > .pill-arrow { display:grid; place-items:center; width:2.25rem; height:2.25rem; border-radius:9999px;
        transition:transform .25s cubic-bezier(.2,.8,.2,1); }
.pill:hover > .pill-arrow { transform:translateX(3px); }
/* สีของแคปซูล: .pill-dark (ink พื้น, วงกลมขาว/ลูกศรดำ) · .pill-outline (ขอบ brand-300, วงกลม ink) · .pill-brand (ชมพู, วงกลมขาว) */

/* hero: บรรทัดขึ้นจากใต้ clip ตอนโหลด */
.rise > span { display:block; overflow:hidden; }
.rise > span > span { display:block; transform:translateY(110%); opacity:0;
        animation:rise .9s cubic-bezier(.215,.61,.355,1) forwards; }
.rise > span:nth-child(2) > span { animation-delay:.12s } .rise > span:nth-child(3) > span { animation-delay:.24s }
@keyframes rise { to { transform:none; opacity:1 } }

/* scroll reveal — ซ่อนเฉพาะเมื่อ JS มา (html.js) */
html.js .reveal { opacity:0; transform:translateY(24px);
        transition:opacity .7s cubic-bezier(.22,1,.36,1), transform .7s cubic-bezier(.22,1,.36,1); }
html.js .reveal.is-in { opacity:1; transform:none; }

/* การ์ดยกตอน hover */
.lift { transition:transform .3s cubic-bezier(.2,.8,.2,1); } .lift:hover { transform:translateY(-4px); }

@media (prefers-reduced-motion: reduce) {
  .reveal, .rise > span > span, .pill, .pill > .pill-arrow, .lift { animation:none !important; transition:none !important; }
  .reveal, .rise > span > span { opacity:1 !important; transform:none !important; }
}
```

`.pill` มีคลาสสี 3 แบบ (`.pill-dark` / `.pill-outline` / `.pill-brand`) กำหนดพื้น+สีตัวหนังสือ+สีวงกลม · ปุ่มเดิม
`.btn-primary/.btn-secondary` ยังอยู่ (หน้าอื่นใช้) หน้านี้ใช้ `.pill` แทนทั้งหมด

### `[locale]/layout.tsx` — 1 บรรทัด

ใน `THEME_SCRIPT` (สคริปต์ inline ที่รันก่อน paint อยู่แล้ว) เติม `document.documentElement.classList.add('js')` →
สถานะซ่อนของ `.reveal` มีผลเฉพาะเมื่อ JS รัน · ไม่มี JS / crawler ที่ไม่รัน JS เห็นเนื้อหาครบ

### `src/components/Reveal.tsx` (client, ~25 บรรทัด)

```tsx
"use client";
// ห่อ children ด้วย <div className="reveal"> · IntersectionObserver once (threshold .15) → เติม class is-in
// ไม่มี useState (แก้ class ผ่าน ref) → ไม่โดน lint set-state-in-effect · prop: delay?: number (ms → style.transitionDelay), className?
```
ใช้ `as` ไม่ต้อง — ห่อ `<div>` เสมอ (section ยังเป็น `<section>` ข้างนอก)

### `src/components/HeroMock.tsx` (server, Tailwind ล้วน ไม่มีรูป)

การ์ดจำลอง "หน้ารับทิป" ขนาด `w-full max-w-sm` `rounded-3xl` พื้นขาว (dark: brand-50) ขอบ brand-900/10 เงานุ่ม
`rotate-2` (lg เท่านั้น; มือถือไม่เอียง) ข้างใน:
- แถบบน: วงกลม avatar ไล่เฉด brand-400→600 ตัวอักษร "T" · ชื่อ "ครีเอเตอร์ของคุณ" · `@yourname` สีชมพู
- แถวจำนวน: 3 ชิป `฿20 ฿50 ฿100` (อันกลางเป็นชมพูเต็ม = ถูกเลือก)
- ช่องข้อความ (div ปลอม) "สู้ๆ นะ 💗" — ไม่มี emoji: ใช้ "สู้ๆ นะ" + ไอคอน `heart` ชมพู
- กรอบ QR: สี่เหลี่ยม `aspect-square w-24` พื้น brand-50 มี `<Icon name="smartphone">` กลาง + ข้อความ "สแกนพร้อมเพย์"
- ป้ายลอยมุมล่างขวา `-rotate-3`: `.ink` แคปซูลเล็ก `[check-circle เขียว] โอนแล้ว ฿50` (คือ "ผลลัพธ์" ที่ครีเอเตอร์ได้)
ทุกอย่างเป็น `aria-hidden` (ของประกอบ ไม่ใช่เนื้อหา) · ข้อความในการ์ดเป็น i18n (`landing.mock*`)

### `src/app/[locale]/page.tsx` — โครงใหม่ (query/session/JSON-LD เดิมทั้งหมด)

```
<div class="space-y-20 sm:space-y-28">
  <section hero>  relative · watermark TIPTANG ด้านล่างหลังเนื้อหา
    grid lg:grid-cols-12 gap-10 items-center pt-8 sm:pt-14
    ├ ซ้าย lg:col-span-7 (ไม่ text-center อีกต่อไป)
    │  eyebrow  [จุดชมพู] t("heroEyebrow")                     ← ใหม่: "ทางเลือกแทน TipMe · ฟรี 0%"
    │  <h1 class="rise …">  3 บรรทัดจากคีย์ใหม่ heroLine1/2/3 (ไม่ split heroTitle ด้วยโค้ด — ภาษาอังกฤษตัดคนละที่)
    │     = "รับทิปจากแฟนๆ" / "ผ่านพร้อมเพย์" / "ฟรี 100% ไม่หักสักบาท" (บรรทัด 3 สี brand-600) · heroTitle เดิมคงไว้ (ยังถูกอ้างที่อื่นได้)
    │  <p> heroSubtitle เดิม  max-w-xl
    │  ปุ่ม: login → .pill.pill-dark ctaDashboard · ไม่ login → .pill.pill-dark ctaPrimary + .pill.pill-outline ctaSecondary (ไม่มีลูกศร)
    │  แถวรีวิว (เฉพาะ reviewCount>0): ★×5 ชมพู + t("heroRating",{avg,count})   ← ใหม่: "{avg} จาก {count} รีวิว"
    └ ขวา lg:col-span-5 justify-self-end  <HeroMock/>  (Reveal delay 200)
    แถบสถานะล่าง hero: border-t brand-900/10 mt-12 py-4 text-xs uppercase tracking-wide brand-900/60
       3 ข้อความจาก ctaMicro.split(" • ") : ซ้าย/กลาง(ซ่อน <sm)/ขวา  — ไม่มีคีย์ใหม่
  </section>

  <Reveal><section ใช้งานอย่างไร>
    h2 เดิม (ซ้าย ไม่ center) + grid sm:grid-cols-3 gap-4
    การ์ด: <article class="ink lift rounded-3xl p-6 min-h-[13rem] relative">
      เลข 01/02/03  text-5xl font-black text-white/10 absolute top-4 right-5
      ไอคอนในวงกลม brand-500/20 สี brand-400 · h3 ชื่อขั้น (ตัด "1. " หน้าออก — เลขมีแล้ว: ใช้ replace(/^\d+\.\s*/,"")) · p คำอธิบาย text-white/60
  </section></Reveal>

  <Reveal><section ทำไมต้อง TipTang>
    lg:grid-cols-[1fr_2fr] gap-8 : ซ้าย h2 · ขวา <ol class="divide-y divide-brand-900/10">
      แถว: flex gap-4 py-5 rounded-2xl px-3 transition-colors hover:bg-brand-50
           <span w-8 text-sm font-semibold text-brand-900/40>0n</span> <p text-lg font-semibold flex-1>feature n</p> <Icon check-circle brand-600/>
  </section></Reveal>

  <Reveal><section เปรียบเทียบ>
    h2 เดิม · <div class="overflow-hidden rounded-3xl border border-brand-900/10">
      หัว: grid-cols-[1.4fr_1fr_1fr] class="ink" (ตัวขาว) · คอลัมน์ TipTang ทุกแถว bg-brand-50 font-bold text-brand-700
      แถว: border-t hover:bg-brand-50/60 transition-colors · ข้อความ text-sm ห่อบรรทัดได้ (ไม่ nowrap)
    compareNote เดิม
  </section></Reveal>

  <Reveal><section FAQ>
    h2 เดิม · <div class="mx-auto max-w-2xl divide-y divide-brand-900/10">
      <details class="group py-5"> summary เดิม (＋ หมุน) · ไม่มี .card
  </section></Reveal>

  <Reveal><ReviewsSection … เดิม/></Reveal>

  <Reveal><section CTA ปิดท้าย>
    <div class="ink relative overflow-hidden rounded-3xl p-8 sm:p-12">
      h2 text-3xl sm:text-4xl font-extrabold  t("ctaBandTitle")      ← ใหม่: "พร้อมรับทิปแรกหรือยัง?"
      p text-white/60  t("ctaBandDesc")                              ← ใหม่: "สมัครฟรี ตั้งค่า 3 นาที ไม่ต้องใส่บัตร"
      ปุ่ม .pill.pill-brand (login → ctaDashboard / ไม่ → ctaPrimary)
      watermark TIPTANG absolute -bottom-6 inset-x-0 text-center text-[7rem] sm:text-[11rem] font-black text-white/5 pointer-events-none select-none aria-hidden
  </section></Reveal>
</div>
```

**Watermark hero:** `absolute inset-x-0 bottom-0 text-center text-[6rem] sm:text-[11rem] font-black leading-none
text-brand-900/5 pointer-events-none select-none` `aria-hidden` วางเป็นลูกแรกของ section (z ต่ำกว่าเนื้อหาที่ `relative`)
· มือถือ `overflow-hidden` ที่ section กันตัวหนังสือล้นแนวนอน

### i18n (`landing`, th/en) — เพิ่มเท่านั้น ไม่ลบ

| คีย์ | th | en |
|---|---|---|
| `heroEyebrow` | ทางเลือกแทน TipMe · ฟรี 0% | The TipMe alternative · 0% fees |
| `heroLine1` / `heroLine2` / `heroLine3` | รับทิปจากแฟนๆ / ผ่านพร้อมเพย์ / ฟรี 100% ไม่หักสักบาท | Get tips from fans / via PromptPay / 100% free, zero cut |
| `heroRating` | {avg} จาก {count} รีวิว | {avg} from {count} reviews |
| `ctaBandTitle` | พร้อมรับทิปแรกหรือยัง? | Ready for your first tip? |
| `ctaBandDesc` | สมัครฟรี ตั้งค่า 3 นาที ไม่ต้องใส่บัตร | Free to join, 3-minute setup, no card needed |
| `mockName` / `mockMessage` / `mockScan` / `mockPaid` | ครีเอเตอร์ของคุณ / สู้ๆ นะ / สแกนพร้อมเพย์ / โอนแล้ว ฿50 | Your channel / You got this / Scan PromptPay / Paid ฿50 |

`avg` แสดง 1 ตำแหน่งทศนิยม (`avgRating.toFixed(1)`)

## สิ่งที่ตั้งใจไม่ทำ

- ไม่ทำ loader / Lenis / liquid reveal / count-up / word reveal (ตัดสินใจแล้วในแชท)
- ไม่ทำ section สถิติ (ตัวเลขจริงยังเล็ก) · ไม่ทำ "portfolio" โชว์หน้าครีเอเตอร์จริง (ต้องขออนุญาต)
- ไม่แก้ `ReviewsSection` (การ์ดรีวิวข้างในยังเป็น `.card` — ยอมรับ) · ไม่แตะฟอนต์ (Onest ไม่มีตัวไทย)
- ไม่เปลี่ยนข้อความขาย (heroTitle/subtitle/feature/compare/faq เดิมทุกตัว)

## การทดสอบ (dev server · หน้านี้สาธารณะ ไม่ต้องล็อกอิน)

1. `tsc` · `build` · `lint` **คงที่ 5** · `npm test` ยังผ่าน
2. `/th`: h1 มี 3 บรรทัด `.rise > span` · `document.querySelectorAll('.card').length` = เฉพาะที่อยู่ใน ReviewsSection
   (นับก่อน/หลังเทียบ) · `.ink` ≥ 5 (3 การ์ดขั้นตอน + หัวตาราง + แถบ CTA)
3. reveal: โหลดหน้า → section ล่างมี class `reveal` ไม่มี `is-in` · เลื่อนลง → ได้ `is-in` · `html.classList.contains('js')` = true
4. ปิด JS จำลอง: ลบ class `js` ออกจาก html → `.reveal` ทุกอันมี `opacity` = 1 (computed)
5. `prefers-reduced-motion` (emulate ผ่าน CSS media ใน DevTools ไม่ได้ในเพน → ตรวจจาก stylesheet ว่ามีบล็อกและคลาสครบ)
6. มือถือ 375: `scrollWidth <= 375` · ตารางเห็น 3 คอลัมน์ · HeroMock ไม่เอียง · watermark ไม่ทำให้ล้น
7. Dark/light: การ์ด `.ink` แยกจากพื้นมืดได้ (ขอบเห็น) · ชมพูอ่านได้บน ink
8. Login แล้ว (`/th` ขณะล็อกอิน): ปุ่ม hero และ CTA band เป็น "ไปที่หน้าหลัก" ทั้งคู่
9. `/en` ข้อความใหม่ทุกคีย์ขึ้นครบ ไม่มี missing-key ใน console
10. **ไม่ push** — ผู้ใช้ดูใน `localhost:3000/th` ก่อน
