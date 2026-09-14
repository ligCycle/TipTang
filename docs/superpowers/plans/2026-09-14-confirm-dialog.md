# ConfirmDialog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แทน `window.confirm()` ทั้ง 4 จุดในแดชบอร์ดด้วย `ConfirmDialog` ตัวเดียวที่ตามธีมเว็บและ dark mode

**Architecture:** component ใหม่ครอบ `<dialog>` ของ HTML (`showModal()` ให้ backdrop / focus trap / Escape ฟรี) parent ถือ `open` state · แต่ละจุดเรียกใช้เปลี่ยนจาก "ถามแล้วทำทันที" เป็น "เปิดกล่อง → ทำใน onConfirm" · เพิ่ม `.btn-danger` ใน globals.css สำหรับปุ่มลบ

**Tech Stack:** React 19 · Next.js 16.2 · Tailwind v4 (`backdrop:` variant) · next-intl

**Spec:** `docs/superpowers/specs/2026-09-14-confirm-dialog-design.md`

## Global Constraints

- **ห้าม `git push`** — อยู่บน branch `goal-reset` ต่อจากงานก่อนหน้า commit ในเครื่องได้
- **ไม่เพิ่มคีย์ i18n** — ใช้ข้อความยืนยันเดิม + ป้ายปุ่มเดิม + `common.cancel`
- `npm run lint` error คงที่ **5** (`react-hooks/set-state-in-effect` ของเดิม) — effect ใน ConfirmDialog ต้องไม่เรียก setState
- ไม่มี test framework → ทุก task ปิดด้วย `tsc` + ตรวจจริงตาม spec §การทดสอบ
- `ShopManager` อยู่หลัง flag `SHOP_ENABLED=false` → ตรวจได้แค่ `tsc`

---

## File Structure

| ไฟล์ | หน้าที่ | สถานะ |
|---|---|---|
| `src/components/ConfirmDialog.tsx` | กล่องยืนยันกลาง ครอบ `<dialog>` | สร้าง |
| `src/app/globals.css` | `.btn-danger` (ลอก `.btn-primary` เป็น rose) | แก้ |
| `src/components/OverlaySettings.tsx` | เริ่มรอบใหม่ → ใช้ dialog | แก้ |
| `src/components/TipRow.tsx` | ลบทิป → ใช้ dialog | แก้ |
| `src/components/ClearRejectedButton.tsx` | ลบที่ปฏิเสธทั้งหมด → ใช้ dialog | แก้ |
| `src/components/ShopManager.tsx` | ลบสินค้า → ใช้ dialog | แก้ |

---

### Task 1: `ConfirmDialog` + `.btn-danger`

**Files:**
- Create: `src/components/ConfirmDialog.tsx`
- Modify: `src/app/globals.css` (ต่อจากบล็อก `.btn-secondary:disabled`, ก่อน `[data-theme="dark"]`)

**Interfaces:**
- Produces: `ConfirmDialog` props `{ open: boolean; message: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }` — Task 2-4 ใช้ตามนี้เป๊ะ
- Produces: class `.btn-danger`

- [ ] **Step 1: สร้าง `src/components/ConfirmDialog.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

/**
 * Themed replacement for window.confirm(). Built on the native <dialog>:
 * showModal() gives us the backdrop, focus trapping and Escape handling for
 * free, so there is no portal, no focus-trap library and no z-index fight.
 *
 * The parent owns `open`. Escape and backdrop clicks call onCancel. The
 * confirm button is focused on open so Enter confirms, like the native box.
 */
export function ConfirmDialog({
  open,
  message,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
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
}) {
  const tc = useTranslations("common");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Mirror the `open` prop onto the native element. React's autoFocus prop
  // only fires on mount (while the dialog is still closed), so focus the
  // confirm button by hand right after showModal().
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      confirmRef.current?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      // Fires on Escape. Block it while busy so the action can't be orphaned.
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      // Fires after any close. If the parent still thinks we're open, the
      // user closed it (Escape) — tell the parent. If the parent already set
      // open=false, the effect above closed it and there's nothing to do.
      onClose={() => {
        if (open) onCancel();
      }}
      // The dialog itself has no padding, so a click whose target is the
      // dialog element (not the panel inside) is a click on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      className="card w-[min(92vw,26rem)] rounded-2xl border-0 p-0 text-brand-900 backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <p className="text-base font-semibold leading-relaxed">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-secondary px-4 py-2 text-sm"
          >
            {tc("cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`${danger ? "btn-danger" : "btn-primary"} px-4 py-2 text-sm`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 2: เพิ่ม `.btn-danger` ใน `src/app/globals.css`**

หา:
```css
.btn-secondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
```
เพิ่มต่อท้าย:
```css

/* Destructive actions (delete). Same shape as .btn-primary, rose instead of
   brand, so every "this can't be undone" button reads the same way. */
.btn-danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border-radius: 9999px;
  background: var(--color-rose-600);
  padding: 0.7rem 1.4rem;
  font-weight: 600;
  color: #fff;
  box-shadow: 0 8px 20px -8px rgba(225, 29, 72, 0.6);
  transition: background 0.15s, opacity 0.15s;
}
.btn-danger:hover {
  background: var(--color-rose-700);
}
.btn-danger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
```

- [ ] **Step 3: ตรวจ type**

Run: `npx tsc --noEmit`
Expected: ผ่านเงียบ (component ยังไม่มีใครใช้ แค่เช็กว่าคอมไพล์)

- [ ] **Step 4: Commit**

```bash
git add src/components/ConfirmDialog.tsx src/app/globals.css
git commit -m "Add ConfirmDialog, a themed replacement for window.confirm()

Wraps the native <dialog> so backdrop, focus trapping and Escape come for
free. Adds .btn-danger for the destructive variant.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: OverlaySettings — เริ่มรอบใหม่

**Files:**
- Modify: `src/components/OverlaySettings.tsx` (import · state ใกล้ `resettingGoal` · `resetGoal()` บรรทัด ~242 · ปุ่มใน goal panel)

**Interfaces:**
- Consumes: `ConfirmDialog` จาก Task 1

- [ ] **Step 1: import**

ใต้ `import { formatDate } from "@/lib/format";` เพิ่ม:
```ts
import { ConfirmDialog } from "@/components/ConfirmDialog";
```

- [ ] **Step 2: state**

ใต้ `const [resettingGoal, setResettingGoal] = useState(false);` เพิ่ม:
```ts
  const [goalResetOpen, setGoalResetOpen] = useState(false);
```

- [ ] **Step 3: `resetGoal()` ไม่ถามเองแล้ว และปิดกล่องเมื่อจบ**

แทนที่ทั้งฟังก์ชัน:
```ts
  async function resetGoal() {
    // This shows on the live stream within seconds — make them mean it.
    if (!window.confirm(t("obsGoalResetConfirm"))) return;
    setResettingGoal(true);
    try {
      const fd = new FormData();
      fd.set("kind", "goalReset");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok && typeof d.goalStartedAt === "string") {
        setConfig((c) => (c ? { ...c, goalStartedAt: d.goalStartedAt } : c));
        setGoalRefresh((n) => n + 1); // reload the preview iframe, like saveGoal
      }
    } finally {
      setResettingGoal(false);
    }
  }
```
ด้วย:
```ts
  // Runs after the creator confirms in the dialog (it lands on stream within
  // seconds, so the button itself only opens the dialog).
  async function resetGoal() {
    setResettingGoal(true);
    try {
      const fd = new FormData();
      fd.set("kind", "goalReset");
      const res = await fetch("/api/overlay/asset", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok && typeof d.goalStartedAt === "string") {
        setConfig((c) => (c ? { ...c, goalStartedAt: d.goalStartedAt } : c));
        setGoalRefresh((n) => n + 1); // reload the preview iframe, like saveGoal
      }
    } finally {
      setResettingGoal(false);
      setGoalResetOpen(false);
    }
  }
```

- [ ] **Step 4: ปุ่มเปิดกล่อง + เรนเดอร์กล่อง**

แทนที่:
```tsx
                  {config.hasGoal && (
                    <button
                      type="button"
                      onClick={resetGoal}
                      disabled={resettingGoal || savingGoal}
                      className="btn-secondary mt-2 w-full py-2 text-sm"
                    >
                      {resettingGoal ? t("obsGoalResetting") : t("obsGoalReset")}
                    </button>
                  )}
```
ด้วย:
```tsx
                  {config.hasGoal && (
                    <button
                      type="button"
                      onClick={() => setGoalResetOpen(true)}
                      disabled={resettingGoal || savingGoal}
                      className="btn-secondary mt-2 w-full py-2 text-sm"
                    >
                      {resettingGoal ? t("obsGoalResetting") : t("obsGoalReset")}
                    </button>
                  )}
                  <ConfirmDialog
                    open={goalResetOpen}
                    message={t("obsGoalResetConfirm")}
                    confirmLabel={t("obsGoalReset")}
                    busy={resettingGoal}
                    onConfirm={resetGoal}
                    onCancel={() => setGoalResetOpen(false)}
                  />
```

- [ ] **Step 5: ตรวจ**

Run: `npx tsc --noEmit` → ผ่านเงียบ

เปิด `localhost:3000/th/dashboard/settings` (ล็อกอิน lig_1569) → ส่วน Goal → กด "เริ่มรอบใหม่":
- ขึ้น**กล่องของเรา** (การ์ดกลางจอ พื้นหลังมืด) ไม่ใช่ "localhost:3000 says"
- ข้อความ "เริ่มรอบใหม่? ยอดบน goal bar จะกลับเป็น 0 ทันที (ทิปเก่าไม่หายไปไหน)"
- ปุ่ม **ยกเลิก** (ขอบ) + **เริ่มรอบใหม่** (ชมพูแบรนด์) โฟกัสอยู่ที่ปุ่มยืนยัน
- Escape → ปิด · คลิกพื้นมืด → ปิด · ยกเลิก → ปิด ไม่มีอะไรเปลี่ยน
- ยืนยัน → ปุ่มทั้งสอง disabled ชั่วครู่ → กล่องปิด → "นับตั้งแต่ …" เป็นเวลาใหม่

- [ ] **Step 6: Commit**

```bash
git add src/components/OverlaySettings.tsx
git commit -m "Confirm goal reset with the themed dialog instead of window.confirm

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: TipRow + ClearRejectedButton — ลบทิป

**Files:**
- Modify: `src/components/TipRow.tsx` (import · state · `del()` บรรทัด ~93 · ปุ่มลบ บรรทัด ~153)
- Modify: `src/components/ClearRejectedButton.tsx` (ทั้งไฟล์ — สั้น)

**Interfaces:**
- Consumes: `ConfirmDialog`

- [ ] **Step 1: TipRow — import + state**

ใต้ `import { Icon, type IconName } from "@/components/Icon";` เพิ่ม:
```ts
import { ConfirmDialog } from "@/components/ConfirmDialog";
```
หา `const [loading, setLoading] = useState(false);` ใน TipRow เพิ่มบรรทัดถัดไป:
```ts
  const [deleteOpen, setDeleteOpen] = useState(false);
```

- [ ] **Step 2: TipRow — `del()` ไม่ถามเอง**

แทนที่:
```ts
  async function del() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/tips/${tip.id}`, { method: "DELETE" });
      if (res.ok) {
        // The row unmounts on refresh — don't touch state afterwards.
        router.refresh();
        return;
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }
```
ด้วย:
```ts
  // Runs after the creator confirms in the dialog.
  async function del() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tips/${tip.id}`, { method: "DELETE" });
      if (res.ok) {
        // The row unmounts on refresh — don't touch state afterwards.
        router.refresh();
        return;
      }
      setLoading(false);
      setDeleteOpen(false);
    } catch {
      setLoading(false);
      setDeleteOpen(false);
    }
  }
```

- [ ] **Step 3: TipRow — ปุ่ม + กล่อง**

แทนที่:
```tsx
          {tip.status !== "CONFIRMED" && (
            <button
              onClick={del}
              disabled={loading}
              className="rounded-full border border-rose-200 px-3 py-1 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              {t("delete")}
            </button>
          )}
```
ด้วย:
```tsx
          {tip.status !== "CONFIRMED" && (
            <>
              <button
                onClick={() => setDeleteOpen(true)}
                disabled={loading}
                className="rounded-full border border-rose-200 px-3 py-1 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                {t("delete")}
              </button>
              <ConfirmDialog
                open={deleteOpen}
                message={t("deleteConfirm")}
                confirmLabel={t("delete")}
                danger
                busy={loading}
                onConfirm={del}
                onCancel={() => setDeleteOpen(false)}
              />
            </>
          )}
```

- [ ] **Step 4: ClearRejectedButton — เขียนใหม่ทั้งไฟล์**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/Icon";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function ClearRejectedButton({ count }: { count: number }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Runs after the creator confirms in the dialog.
  async function clearAll() {
    setLoading(true);
    try {
      const res = await fetch("/api/tips", { method: "DELETE" });
      if (res.ok) {
        router.refresh();
        return;
      }
      setLoading(false);
      setOpen(false);
    } catch {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
        {t("clearRejected")}
      </button>
      <ConfirmDialog
        open={open}
        message={t("clearRejectedConfirm", { count })}
        confirmLabel={t("clearRejected")}
        danger
        busy={loading}
        onConfirm={clearAll}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 5: ตรวจ**

Run: `npx tsc --noEmit` → ผ่านเงียบ

เปิด `localhost:3000/th/dashboard` → ถ้ามีทิป PENDING/REJECTED กดปุ่ม **ลบ** ของแถวนั้น:
- ขึ้นกล่อง "ลบทิปนี้ถาวร? กู้คืนไม่ได้" ปุ่มยืนยัน**สีแดง**
- กด **ยกเลิก** → ทิปยังอยู่ (ทดสอบแค่ยกเลิกพอ ไม่ต้องลบจริง)

ถ้าไม่มีทิปที่ไม่ใช่ CONFIRMED ให้ข้าม (ปุ่มไม่โผล่) — `tsc` ผ่านคือหลักฐาน

- [ ] **Step 6: Commit**

```bash
git add src/components/TipRow.tsx src/components/ClearRejectedButton.tsx
git commit -m "Confirm tip deletion with the themed dialog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: ShopManager — ลบสินค้า

**Files:**
- Modify: `src/components/ShopManager.tsx` (import · state ใกล้ `editing` · `archive()` บรรทัด ~113 · ท้าย JSX)

**Interfaces:**
- Consumes: `ConfirmDialog` · type `Item` ที่มีอยู่ในไฟล์

- [ ] **Step 1: import + state**

ใต้ `import { Icon } from "@/components/Icon";` เพิ่ม:
```ts
import { ConfirmDialog } from "@/components/ConfirmDialog";
```
ใต้ `const [editing, setEditing] = useState<Item | null>(null);` เพิ่ม:
```ts
  // Item waiting for the creator to confirm deletion; null = dialog closed.
  const [pendingArchive, setPendingArchive] = useState<Item | null>(null);
```

- [ ] **Step 2: `archive()` เปิดกล่อง แทนที่จะถามเอง**

แทนที่:
```ts
  function archive(item: Item) {
    if (!confirm(t("confirmDelete"))) return;
    const fd = new FormData();
    fd.set("intent", "archive");
    patchItem(item.id, fd);
  }
```
ด้วย:
```ts
  function archive(item: Item) {
    setPendingArchive(item);
  }

  // Runs after the creator confirms in the dialog.
  function confirmArchive() {
    if (!pendingArchive) return;
    const fd = new FormData();
    fd.set("intent", "archive");
    patchItem(pendingArchive.id, fd);
    setPendingArchive(null);
  }
```

- [ ] **Step 3: เรนเดอร์กล่องท้าย component**

ท้ายไฟล์ JSX ปิดด้วย:
```tsx
      )}
    </div>
  );
}
```
แทรกก่อน `    </div>` บรรทัดสุดท้ายของ root:
```tsx
      <ConfirmDialog
        open={pendingArchive !== null}
        message={t("confirmDelete")}
        confirmLabel={t("delete")}
        danger
        onConfirm={confirmArchive}
        onCancel={() => setPendingArchive(null)}
      />
```
ผลลัพธ์ท้ายไฟล์:
```tsx
      )}
      <ConfirmDialog
        open={pendingArchive !== null}
        message={t("confirmDelete")}
        confirmLabel={t("delete")}
        danger
        onConfirm={confirmArchive}
        onCancel={() => setPendingArchive(null)}
      />
    </div>
  );
}
```

- [ ] **Step 4: ตรวจ**

Run: `npx tsc --noEmit` → ผ่านเงียบ (ร้านค้าปิด flag อยู่ ตรวจในเบราว์เซอร์ไม่ได้ — `tsc` คือหลักฐาน)

- [ ] **Step 5: Commit**

```bash
git add src/components/ShopManager.tsx
git commit -m "Confirm shop item deletion with the themed dialog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: ตรวจรวม

- [ ] **Step 1: ไม่เหลือ window.confirm**

Run: `rg -n "window\.confirm|[^.\w]confirm\(" src`
Expected: ไม่มีผลลัพธ์ (exit 1)

- [ ] **Step 2: lint คงที่ / build**

Run: `npm run lint 2>&1 | tail -1` → `✖ 5 problems (5 errors, 0 warnings)`
Run: `npm run build 2>&1 | tail -3` → จบด้วยตาราง route ไม่มี error
**หลัง build ต้อง `rm -rf .next` แล้ว start dev ใหม่** — ไม่งั้น API `/api/overlay/[username]/*` เป็น 404 (บทเรียนจากงานก่อน)

- [ ] **Step 3: Dark mode**

ในหน้าตั้งค่า กดสลับธีมเป็นมืด → เปิดกล่องเริ่มรอบใหม่ → การ์ดต้องมืด ตัวหนังสืออ่านออก ปุ่มตามธีม (`.card` dark variant + `text-brand-900` remap)

- [ ] **Step 4: รายงาน — ไม่ push**

สรุป commits บน `goal-reset`, ผล tsc/lint/build, ผลตรวจกล่องแต่ละจุด แล้วรอผู้ใช้ทดสอบ

---

## Self-review

**Spec coverage** — component + `<dialog>` semantics (T1) · `.btn-danger` (T1) · 4 จุดตามตารางใน spec: OverlaySettings ไม่ danger/busy=resettingGoal (T2) · TipRow danger/busy=loading (T3) · ClearRejectedButton danger/busy=loading (T3) · ShopManager danger/pendingArchive state (T4) · ไม่มี i18n ใหม่ ✓ · ทดสอบ 7 ข้อของ spec กระจายใน T2 ขั้น 5, T3 ขั้น 5, T5

**Placeholder scan** — ไม่มี

**Type consistency** — props `{ open, message, confirmLabel, danger?, busy?, onConfirm, onCancel }` ตรงกันทุก call site · ShopManager ไม่ส่ง `busy` (optional) ✓
