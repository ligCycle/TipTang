# ConfirmDialog: แทน `window.confirm()` ทั้ง 4 จุดในแดชบอร์ด

วันที่: 2026-09-14 · สถานะ: อนุมัติในแชท (ผู้ใช้เลือก "ทั้ง 4 ที่")

## ปัญหา

การยืนยันก่อนทำสิ่งที่ย้อนกลับยากในแดชบอร์ดใช้ `window.confirm()` ของเบราว์เซอร์ทั้งหมด 4 จุด:

| ไฟล์ | การกระทำ |
|---|---|
| `src/components/OverlaySettings.tsx` | เริ่มรอบใหม่ของ goal |
| `src/components/TipRow.tsx` | ลบทิป |
| `src/components/ClearRejectedButton.tsx` | ลบทิปที่ปฏิเสธทั้งหมด |
| `src/components/ShopManager.tsx` | ลบสินค้า |

กล่องนั้นขึ้นหัวว่า "localhost:3000 says" / "tiptang.com says" ปุ่มเป็นสไตล์ของเบราว์เซอร์
ไม่ตามธีม ไม่รองรับ dark mode — เป็นส่วนหนึ่งของความรู้สึกว่าแดชบอร์ด "เหมือนฟอร์มธรรมดา"
และโปรเจกต์ยังไม่มี dialog component กลางเลย

## สิ่งที่ต้องได้

1. component เดียว `ConfirmDialog` ใช้แทนทั้ง 4 จุด หน้าตาเดียวกันหมด
2. ตามธีมเว็บ (การ์ด `.card`, ปุ่ม `.btn-primary` / `.btn-secondary`) และ dark mode
3. การลบใช้ปุ่มสีแดง (rose) · เริ่มรอบใหม่ใช้สีแบรนด์
4. กด Escape / คลิกนอกกล่อง = ยกเลิก · ระหว่างรอ API ปุ่มกดไม่ได้และปิดไม่ได้
5. **ไม่เพิ่มคีย์ i18n** — ข้อความยืนยันเดิม 4 ตัวเป็นคำถามครบประโยคอยู่แล้ว ใช้เป็นหัวข้อของกล่อง
   ป้ายปุ่มยืนยันใช้ป้ายของการกระทำเดิม (`delete` / `clearRejected` / `obsGoalReset`) ป้ายยกเลิกใช้ `common.cancel`

## ดีไซน์

### `src/components/ConfirmDialog.tsx` (ใหม่, client component)

ใช้ `<dialog>` ของ HTML + `showModal()` — ได้ backdrop, กันโฟกัสหลุดออกนอกกล่อง และ Escape มาฟรี
ไม่ต้องลง library ไม่ต้องทำ portal

```ts
type Props = {
  open: boolean;
  /** The question itself — the existing confirm strings already read as one. */
  message: string;
  confirmLabel: string;
  /** Rose button for destructive actions (delete). Default = brand colour. */
  danger?: boolean;
  /** While the action runs: buttons disabled, Escape/backdrop ignored. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};
```

พฤติกรรม:
- `useEffect` บน `open`: `true` → `el.showModal()` · `false` → `el.close()`
- `onClose` ของ dialog (ยิงตอน Escape หรือปิดจากภายนอก): ถ้า `open` ยังเป็น true = ผู้ใช้กด Escape → เรียก `onCancel()` ·
  ถ้า `open` เป็น false อยู่แล้ว = เราปิดเองจาก effect → ไม่ทำอะไร
- `onCancel` (event) ของ dialog: ถ้า `busy` → `preventDefault()` ไม่ให้ Escape ปิด
- คลิก backdrop: `onClick` ที่ `e.target === e.currentTarget` (dialog ต้อง `p-0` ให้ padding ทั้งหมดอยู่ที่กล่องใน) และไม่ `busy` → `onCancel()`
- ปุ่มยืนยัน `autoFocus` เพื่อให้ Enter = ยืนยัน (แบบเดียวกับ native confirm)
- ปุ่มยกเลิก = `common.cancel` ดึงจาก `useTranslations("common")` ในตัว component เอง

หน้าตา:
- `<dialog className="card w-[min(92vw,26rem)] rounded-2xl border-0 p-0 backdrop:bg-black/50 backdrop:backdrop-blur-sm">`
  `.card` ให้พื้น/ขอบ/เงา + dark variant ที่มีอยู่แล้วใน `globals.css`
- กล่องใน `p-6` · ข้อความ `text-base font-semibold text-brand-900` · ปุ่ม 2 ปุ่ม `flex gap-2 justify-end mt-5`
- ปุ่มยืนยัน: `danger` → `.btn-danger` (ใหม่ ดูข้างล่าง) · ไม่ใช่ → `.btn-primary`
- ปุ่มยกเลิก: `.btn-secondary`
- ขนาดปุ่ม `py-2 px-4 text-sm` ทับค่า default ของ `.btn-*` ให้พอดีกับกล่อง

### `.btn-danger` ใน `src/app/globals.css` (ใหม่)

ลอก `.btn-primary` ทั้งบล็อกแต่ใช้ rose-600/700 — วางถัดจาก `.btn-secondary:disabled`
เพื่อให้การลบทุกที่ในเว็บมีปุ่มสีเดียวกันในอนาคต (`ClearRejectedButton` ก็ใช้โทน rose อยู่แล้ว)

### 4 จุดเรียกใช้ — แพตเทิร์นเดียวกัน

แต่ละจุด: เพิ่ม state `confirmOpen` · ปุ่มเดิมเปลี่ยนจากทำงานทันทีเป็น `setConfirmOpen(true)` ·
ย้ายงานเดิม (fetch ฯลฯ) ไปอยู่ใน `onConfirm` · `busy` ผูกกับ loading state ที่มีอยู่แล้ว ·
`onCancel` = `setConfirmOpen(false)` · เรนเดอร์ `<ConfirmDialog>` ต่อท้าย JSX เดิม

| จุด | `message` | `confirmLabel` | `danger` | `busy` |
|---|---|---|---|---|
| OverlaySettings — เริ่มรอบใหม่ | `t("obsGoalResetConfirm")` | `t("obsGoalReset")` | ไม่ | `resettingGoal` |
| TipRow — ลบทิป | `t("deleteConfirm")` | `t("delete")` | ใช่ | `loading` |
| ClearRejectedButton | `t("clearRejectedConfirm", { count })` | `t("clearRejected")` | ใช่ | `loading` |
| ShopManager — ลบสินค้า | `t("confirmDelete")` | `t("delete")` | ใช่ | ไม่มี loading เดิม → ไม่ส่ง |

หมายเหตุ ShopManager: `archive(item)` รับ item เป็น argument → ต้องเก็บ item ที่รอยืนยันไว้ใน state
`pendingArchive: Item | null` (`null` = ปิด) แทน boolean

หมายเหตุ TipRow: แต่ละแถวเรนเดอร์ `<dialog>` ของตัวเอง (ปิดอยู่ = ไม่แสดง ไม่กิน layout) —
20 แถว = 20 dialog ที่ปิดอยู่ ยอมรับได้ ไม่คุ้มที่จะยกไป parent

## สิ่งที่ตั้งใจไม่ทำ

- แอนิเมชันเปิด/ปิด, toast แจ้งผล, ช่องพิมพ์ยืนยัน, dialog แบบมีฟอร์ม
- ไม่แตะ `alert()` หรือ dialog อื่นนอก 4 จุดนี้

## การทดสอบ (ไม่มี test suite → dev server จริง, บัญชี `lig_1569`)

1. `tsc` · `build` · `lint` **คงที่ 5**
2. **เริ่มรอบใหม่** — กดแล้วขึ้นกล่องของเราแทน "localhost says" · Escape ปิด · คลิกนอกกล่องปิด · Enter = ยืนยัน · ระหว่างรอปุ่มเป็น disabled · ยืนยันแล้วทำงานเหมือนก่อน ("นับตั้งแต่" อัปเดต)
3. **ลบทิป** — ปุ่มยืนยันเป็นสีแดง · ยกเลิกแล้วทิปยังอยู่ · (ห้ามกดยืนยันลบทิปจริงของ lig_1569 ถ้าไม่ตั้งใจ — ใช้ยกเลิกทดสอบก็พอ)
4. **ลบที่ปฏิเสธทั้งหมด** — ปุ่มโผล่เมื่อมีทิปที่ปฏิเสธ · ถ้าไม่มีให้ข้าม
5. **ลบสินค้า** — ร้านค้าปิด flag อยู่ (`SHOP_ENABLED=false`) → ตรวจได้แค่ `tsc` ผ่าน
6. **Dark mode** — สลับธีมแล้วเปิดกล่อง กล่อง/ตัวหนังสือ/ปุ่มต้องตามธีม
7. `rg "window\.confirm|[^.]confirm\(" src` → **ต้องไม่เหลือ**
