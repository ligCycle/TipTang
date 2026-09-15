# หน้าตั้งค่า: แบ่ง 4 หมวด · แถบบันทึกลอยเมื่อมีของค้าง

วันที่: 2026-09-15 · สถานะ: อนุมัติในแชท (ผู้ใช้เลือก A = หน้าเดียว 4 หมวด, แถบบันทึกโผล่เฉพาะตอน dirty)

## ปัญหา

`/[locale]/dashboard/settings` เป็น `.card` ใบเดียว `max-w-lg` ที่ยัดทุกอย่าง: cover → avatar → ชื่อ → username → bio →
พร้อมเพย์ → กล่องเทา "ยืนยันอัตโนมัติ" → กล่องเทา "สี" → กล่องเทา "โซเชียล" → ปุ่มบันทึกล่างสุด แล้วต่อด้วย `.card`
"การเชื่อมบัญชี" อีกใบ — กล่องซ้อนกล่อง ไม่มีการจัดหมวด และคนเลื่อนลงไปแก้โซเชียลแล้วลืมกดบันทึกที่อยู่ไกลออกไป

## สิ่งที่ต้องได้

1. หน้าเดียว **4 หมวด** เรียง: โปรไฟล์ · การรับเงิน · หน้าโดเนท · บัญชี — คั่นด้วยเส้น หัวข้อสไตล์เดียวกับหน้าหลัก/โดเนท
   (`text-xs font-semibold uppercase tracking-wide text-brand-900/60` + ไอคอน)
2. **ไม่มีกล่อง**: ถอด `.card` นอกสุด, กล่องเทาครอบ "ยืนยันอัตโนมัติ / สี / โซเชียล", และ `.card` ของ ConnectedAccounts
3. **แถบบันทึกลอย** ติดล่างจอ โผล่**เฉพาะเมื่อมีการแก้ที่ยังไม่บันทึก** (dirty) · มีปุ่ม "ยกเลิก" (คืนค่า) และ "บันทึก" ·
   บันทึกสำเร็จ → "บันทึกแล้ว!" 1.5 วิ แล้วแถบหาย · error (username ซ้ำ ฯลฯ) แสดงในแถบ
4. รูปปก/รูปโปรไฟล์ยังอัปโหลด+บันทึกทันทีเหมือนเดิม และ**ไม่ทำให้แถบโผล่**
5. เตือนก่อนปิดแท็บ/รีเฟรชเมื่อ dirty (`beforeunload`) — **ข้อจำกัดที่ยอมรับ:** App Router ไม่มี API ดัก client-side
   `<Link>`; กดเมนูบนเว็บตอน dirty จะไม่มีหน้าต่างเตือน แถบที่มองเห็นตลอดคือตัวกันหลัก
6. คีย์บอร์ดมือถือ: ทุก `input`/`textarea` ในฟอร์มมี `scroll-mb-24` ให้ scroll-into-view เว้นที่ใต้ช่องพอสำหรับแถบ
   (Android Chrome ที่ viewport หด) · iOS Safari แถบจะอยู่หลังคีย์บอร์ดซึ่งไม่บังอะไร · **ทดสอบบนมือถือจริงเท่านั้น**
7. ไม่แตะ API (`PATCH /api/profile`, `POST /api/profile/image`) · ไม่แตะ schema · ไม่แตะ `ImageCropper`/`ColorField`
8. ลบคีย์ i18n ตาย `settings.goalSection/goalTitle/goalTitlePlaceholder/goalAmount/goalHint` (ไม่มีใครใช้ตั้งแต่ goal ย้ายไป OBS)

## ดีไซน์

### `src/app/[locale]/dashboard/settings/page.tsx`

`<div className="mx-auto max-w-xl">` → `<SettingsForm initial=… account={{ googleConnected, accountEmail, googleAuthEnabled }} />`
ConnectedAccounts กลายเป็นหมวดที่ 4 **ข้างใน** SettingsForm (ส่งผ่าน prop `account`) เพื่อให้เส้นคั่นและลำดับหมวดอยู่ในที่เดียว

### `src/components/SettingsForm.tsx`

โครง:
```
<div>                                         ← ไม่ใช่ .card
  {cropping && <ImageCropper …/>}             เดิม
  <h1>ตั้งค่า</h1>
  <form onSubmit className="divide-y divide-brand-900/10">
    <Section icon="user"        title=โปรไฟล์>    cover+avatar (เดิม) · ชื่อ · username · bio
    <Section icon="credit-card" title=การรับเงิน>  พร้อมเพย์ (+hint) · checkbox ยืนยันอัตโนมัติ (+hint) — ไม่มีกล่อง
    <Section icon="palette"     title=หน้าโดเนท>   ColorField (+hint) · โซเชียล 7 ช่อง (+hint)
    <Section icon="link"        title=บัญชี>       <ConnectedAccounts …/>   (ถ้า googleAuthEnabled=false หมวดนี้ไม่แสดง)
    <SaveBar/>                                    ลูกสุดท้ายของ form · sticky
  </form>
</div>
```
`Section` = component เล็กในไฟล์เดียวกัน: `<section className="py-6 first:pt-0">` + `<h2>` สไตล์หมวด + `<div className="mt-4 space-y-4">{children}</div>`

**Dirty tracking**
```ts
// เฉพาะฟิลด์ที่ปุ่มบันทึกส่ง เรียงคีย์ตายตัว → JSON.stringify เทียบได้ตรงๆ (ไม่พึ่ง key order ของ object)
function snapshot(f: Initial): string {
  return JSON.stringify({
    displayName: f.displayName, username: f.username, bio: f.bio,
    promptpayId: f.promptpayId, autoConfirmTips: f.autoConfirmTips,
    profileColor: f.profileColor,
    socialLinks: SOCIAL_PLATFORMS.map((p) => f.socialLinks[p.key] ?? ""),
  });
}
const [savedForm, setSavedForm] = useState(initial);   // ค่าที่อยู่ใน DB ล่าสุด
const dirty = snapshot(form) !== snapshot(savedForm);
```
- `avatarUrl/coverUrl` ไม่อยู่ใน snapshot → อัปโหลดรูปไม่ทำให้ dirty (ข้อ 4)
- บันทึกสำเร็จ: `setSavedForm(form)` แล้ว status `saved` 1.5 วิ
- ยกเลิก: `setForm((f) => ({ ...savedForm, avatarUrl: f.avatarUrl, coverUrl: f.coverUrl }))` — คืนค่าข้อความ แต่คงรูปที่อัปโหลดไปแล้ว
- `beforeunload`: `useEffect` ผูก/ถอด listener ตาม `dirty` — ใน effect ไม่มี setState (lint baseline 5 คงเดิม)

**SaveBar** (แสดงเมื่อ `dirty || status !== "idle"`)
```
<div className="card sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-3
                rounded-2xl p-3 shadow-lg">   ← .card ให้สี light/dark ถูกเอง
  <span className="text-sm">
     error ? <red>{error}</red>
     : status==="saved" ? บันทึกแล้ว!
     : มีการแก้ไขที่ยังไม่บันทึก
  </span>
  <div className="flex gap-2">
    <button type="button" onClick={discard} className="btn-secondary">ยกเลิก</button>   (ซ่อนตอน saving/saved)
    <button type="submit" disabled={!dirty || saving} className="btn-primary">บันทึก / กำลังบันทึก...</button>
  </div>
</div>
```
`sticky bottom-4` เป็นลูกสุดท้ายของ `<form>` → ลอยติดล่างจอระหว่างเลื่อน, นั่งลงในที่เมื่อเลื่อนสุด · ไม่ใช้ `fixed`
เพื่อไม่บังหมวด "บัญชี" และอยู่ในคอลัมน์ `max-w-xl` เอง

**ปุ่ม `w-full` เดิมท้ายฟอร์ม → ลบ** (SaveBar แทน)

### `src/components/ConnectedAccounts.tsx`

ถอด `<div className="card mt-6 rounded-3xl p-6">` + `<h2>` + `<p hint>` ออก (หัวข้อ/คำอธิบายย้ายไปเป็นหัวหมวดใน SettingsForm) —
เหลือแถว Google (`rounded-2xl border … p-3`) + hint ตอนยังไม่เชื่อม · prop เดิมทั้งสาม · `if (!googleAuthEnabled) return null` คงไว้
(SettingsForm ไม่ render หมวด "บัญชี" เลยเมื่อ `googleAuthEnabled=false` จะได้ไม่มีหัวข้อเปล่า)

### i18n (`settings`, th/en)

เพิ่ม: `sectionProfile` ("โปรไฟล์"/"Profile"), `sectionPayment` ("การรับเงิน"/"Payments"), `sectionDonate` ("หน้าโดเนท"/"Donate page"),
`sectionAccount` ("บัญชี"/"Account"), `unsavedChanges` ("มีการแก้ไขที่ยังไม่บันทึก"/"You have unsaved changes"), `discard` ("ยกเลิก"/"Discard")
เปลี่ยน: `title` "ตั้งค่าโปรไฟล์"→"ตั้งค่า" / "Profile settings"→"Settings" · `socialSection` "ลิงก์โซเชียล (ไม่บังคับ)" คงไว้เป็นป้ายย่อย
ลบ: `goalSection, goalTitle, goalTitlePlaceholder, goalAmount, goalHint` (grep ยืนยันไม่มีที่ใช้)
`connectedAccounts`/`connectedAccountsHint` ยังใช้เป็นหัว/คำอธิบายหมวดบัญชี

## สิ่งที่ตั้งใจไม่ทำ

- ไม่ทำบันทึกทีละหมวด (ต้องแก้ API + เช็ก username ซ้ำ) · ไม่ทำแท็บ · ไม่แยก URL
- ไม่ดัก client-side navigation (ไม่มี API ทางการ) · ไม่ซ่อนแถบตอน focus
- ไม่แตะฟีเจอร์เปลี่ยนรหัสผ่าน/ลบบัญชี (ยังไม่มีอยู่แล้ว)

## การทดสอบ (dev server · ล็อกอินแล้ว)

1. `tsc` · `build` · `lint` **คงที่ 5**
2. เปิด `/th/dashboard/settings`: 4 หัวหมวดตามลำดับ · `.card` บนหน้า = **0** (แถบยังไม่โผล่) · ไม่มี scroll แนวนอน (มือถือ 375)
3. พิมพ์แก้ชื่อ → แถบโผล่ (`.card` = 1) ข้อความ "มีการแก้ไขที่ยังไม่บันทึก" · กด "ยกเลิก" → ค่ากลับเดิม แถบหาย
4. แก้ bio แล้วกด "บันทึก" → "บันทึกแล้ว!" → แถบหาย · รีเฟรชแล้วค่าใหม่อยู่ · **แก้กลับเป็นค่าเดิมแล้วบันทึกอีกครั้ง** (ไม่ทิ้ง
   ข้อมูลทดสอบไว้บน prod)
5. เปลี่ยน username เป็นของคนอื่น (`nongmewtumarai`) → บันทึก → error "ชื่อลิงก์นี้ถูกใช้แล้ว" ในแถบ · ยกเลิก
6. แก้โซเชียลช่องหนึ่งแล้วลบกลับเป็นค่าเดิม → แถบหาย (พิสูจน์ deep compare)
7. `dirty` แล้ว `window.onbeforeunload` ต้อง non-null (เช็กจาก `javascript_tool` ด้วย dispatch `beforeunload` และดู `defaultPrevented`)
8. Dark/light · แถบอ่านง่ายทั้งสองธีม · ปุ่ม "เชื่อม Google" ยังอยู่ในหมวดบัญชี
9. **ให้ผู้ใช้ทดสอบเอง**หลัง deploy: มือถือจริง พิมพ์ในช่องล่างๆ แถบไม่บังช่อง
