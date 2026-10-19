# Spin Wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fans tick "หมุนวงล้อ" when tipping; once the tip is confirmed the server draws a segment of the wheel the fan saw, the wheel OBS link animates to it, and the result lands in a to-do list (dashboard + OBS) the creator ticks off.

**Architecture:** Pure rules (segment layout, draw, removal, price check, template data) in `src/lib/wheel.ts` with unit tests. Wheels, tasks and spins are new tables folded into the unapplied feature-hub migration. One server module (`src/lib/wheel-server.ts`) owns spin lifecycle — `startSpin` on any confirmation (manual PATCH and auto-confirm in `POST /api/tips`), `cancelSpin` on reject — so both confirm paths share it. Two new overlays (`/wheel`, `/todo`) poll small feeds; a spin is "claimed" by the first wheel overlay that fetches it within 1 hour of confirmation.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` first), React 19, next-intl (th/en parity), Prisma 7 + hand-written SQL, Tailwind 4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-19-spin-wheel-design.md` (read the "Decided after the builder check" and "Slots per task and limits" sections — they supersede earlier lines).

## Global Constraints

- Fold schema into `prisma/migrations/20261018000000_feature_hub/migration.sql` (unapplied; projects ship together). Never touch the production DB: every Prisma CLI call passes local `DIRECT_URL` inline and checks `npx prisma migrate status` host first. Local DB: prisma dev `tiptang-hub2` at `localhost:51230` (stop the dev server before CLI writes if it refuses).
- Limits: 20 wheels/creator; 2–24 tasks/wheel; task text ≤ 40 chars; slots-per-task slider 1–4, capped so tasks × slots ≤ 48; price whole baht 1–100000, default 50; done to-do items kept 30 days.
- Odds: uniform over remaining segments; donate page shows each task's remaining segment count and "ทุกช่องมีโอกาสออกเท่ากัน".
- "ลบช่องที่ออกแล้ว" removes only the segment drawn; reset restores all; empty wheel hides the spin option.
- Spin + sound prices add: amount ≥ max(creator minimum, wheel price + picked sound price). Never raise the fan's amount; options the amount doesn't cover can't be ticked; checks re-run when the amount field is left (as project 2).
- Spin uses the wheel id the fan saw (stored on the tip) and its segments left at confirm time, even if price/active wheel/card changed. Wheel deleted or empty at confirm → the confirm action warns first; creator may reset or confirm without spin.
- Unplayed spins play late if confirmed within the last 1 hour; older only appear in the to-do list.
- Reject after confirm cancels the spin (to-do item removed, removed segment restored, unplayed spin dropped); confirming again restores the same result, no re-roll.
- Rules: Terms section + first-enable checklist of 3 statements (stored time). Hub card off by default. No emoji, gender-neutral copy, autosave where safe, th/en parity. Push only on "merge push". Lint: only the 5 existing errors.

## Review Focus

1. Two tips that both asked to spin are confirmed at the same moment on a removing wheel with one segment left → exactly one spin gets it; the other confirm warns (empty) — no double draw (Task 3 transaction test via the browser race check + `drawSegment` purity).
2. A creator rejects a confirmed tip whose spin already played → the to-do item disappears and, on a removing wheel, the segment comes back; confirming again shows the same result without a new animation (Task 3).
3. The creator edits task text after a spin → the to-do list keeps the text as drawn (snapshot) (Task 1 model + Task 3).
4. Slider at 4 with 13 tasks (52 segments) → the slider caps at 3 and says why; the server rejects >48 (Task 1 `clampSlots` test + Task 4).
5. Two OBS wheel sources open → a spin animates once in total (claimed by the first fetch), not twice (Task 5).

---

### Task 1: Pure wheel rules

**Files:** Create `src/lib/wheel.ts`, `src/lib/wheel.test.ts`

**Interfaces — Produces:**
- `MAX_WHEELS=20`, `MIN_TASKS=2`, `MAX_TASKS=24`, `MAX_SEGMENTS=48`, `MAX_SLOTS=4`, `MAX_TASK_TEXT=40`, `DEFAULT_WHEEL_PRICE=50`, `LATE_PLAY_MS=3_600_000`
- `type WheelTask = { id: string; text: string; noAction: boolean }`
- `type Segment = { key: string; taskId: string }` — key `${taskId}#${copy}` (copy 0..slots-1)
- `layoutSegments(tasks: WheelTask[], slots: number, removed: string[]): Segment[]` — copies of a task spread evenly (round-robin order: all tasks copy 0, then copy 1, …), minus removed keys
- `drawSegment(segments: Segment[], rand: () => number): Segment | null`
- `clampSlots(taskCount: number, slots: number): number` — max s ≤ requested with taskCount × s ≤ 48, at least 1
- `taskOdds(tasks, slots, removed): { taskId: string; text: string; remaining: number }[]`
- `spinFloor(creatorMin: number, wheelPrice: number, soundPrice: number | null): number`
- `TEMPLATES: Record<"task"|"reward"|"game", { name: string; removeWhenHit: boolean; tasks: { text: string; noAction?: boolean }[] }>` — copy from the spec's Templates section (no "spin again").

- [ ] **Step 1: Failing tests** (`node --test src/lib/wheel.test.ts`):
  - `layoutSegments: 3 tasks × 2 slots → 6 segments, copies not adjacent` (order A0 B0 C0 A1 B1 C1)
  - `layoutSegments: removed key is skipped`
  - `drawSegment: uniform index via rand` (rand 0 → first, 0.999 → last), empty → null
  - `clampSlots: 13 tasks asking 4 → 3; 24 tasks asking 4 → 2; 2 tasks asking 4 → 4; never below 1`
  - `taskOdds: counts remaining segments per task after removals`
  - `spinFloor: max(creatorMin, wheel + sound)` — (20, 50, null)→50; (20, 50, 30)→80; (100, 50, 0)→100
  - `TEMPLATES: each has 2–24 tasks, texts ≤ 40, reward removes-when-hit, task/game don't`
- [ ] **Step 2:** run → FAIL (module missing). **Step 3:** implement. **Step 4:** run → PASS. **Step 5:** commit `Wheel: pure rules for segments, draws, limits, templates`.

---

### Task 2: Schema in the feature-hub migration

**Files:** Modify `prisma/schema.prisma`, `prisma/migrations/20261018000000_feature_hub/migration.sql`

**Interfaces — Produces (Prisma):**
- `Wheel { id, userId (Cascade), name, price Int @default(50), slots Int @default(1), removeWhenHit Boolean, removed String[] @default([]), createdAt, updatedAt @updatedAt, tasks WheelTaskRow[], spins Spin[] }` + `@@index([userId])`
- `WheelTaskRow { id, wheelId (Cascade), text, noAction Boolean @default(false), position Int }` + `@@index([wheelId])` (model name `WheelTaskRow` to avoid clashing with the TS type)
- `Spin { id, userId (Cascade), tipId String @unique (Tip, Cascade), wheelId String? (SetNull), segmentKey String, taskText String, noAction Boolean, status SpinStatus @default(ACTIVE), confirmedAt DateTime, playedAt DateTime?, doneAt DateTime?, createdAt }` + `@@index([userId, status])`; `enum SpinStatus { ACTIVE CANCELLED }`
- `User`: `activeWheelId String? @unique` (relation "ActiveWheel", SetNull), `wheelEnabled Boolean @default(false)`, `wheelRulesAcceptedAt DateTime?`
- `Tip`: `spinWheelId String?` (the wheel the fan saw; plain column + index, no FK so a deleted wheel leaves the id for the warning)
- RLS enabled on the three new tables, like `AlertTier`.

- [ ] **Step 1:** edit schema + migration. **Step 2:** fresh throwaway prisma dev DB: `migrate deploy` → applied; `migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `-- This is an empty migration.`; remove it. **Step 3:** apply the same new SQL to `tiptang-hub2` with `db execute`; `npx prisma generate`. **Step 4:** commit `Wheel: schema in the feature-hub migration`.

---

### Task 3: Spin lifecycle on confirm / reject

**Files:** Create `src/lib/wheel-server.ts`; Modify `src/app/api/tips/route.ts`, `src/app/api/tips/[id]/route.ts`

**Interfaces:**
- Consumes: Task 1 `layoutSegments`, `drawSegment`, `spinFloor`; Task 2 models.
- Produces:
  - `startSpin(tipId: string): Promise<"started" | "restored" | "none" | "empty">` — no-op `"none"` if the tip has no `spinWheelId`; if a CANCELLED spin exists for the tip → set ACTIVE, re-add its segment to `removed` when the wheel removes-when-hit, `"restored"`; else in one transaction re-read the wheel (`SELECT … FOR UPDATE` via `$transaction` with `prisma.$queryRaw` lock, or `updateMany` guarded on `updatedAt`), draw, create Spin (`taskText` snapshot), append to `removed` when removeWhenHit, `"started"`; wheel missing/empty → `"empty"` (no spin).
  - `cancelSpin(tipId: string): Promise<void>` — ACTIVE → CANCELLED; if removeWhenHit and the segment is in `removed`, take it out.
  - `spinBlocker(tipId: string): Promise<"empty" | null>` — for the confirm warning.
  - `POST /api/tips`: reads `spinWheel=1`; keeps `spinWheelId` only if `wheelEnabled`, active wheel has segments and `amount ≥ spinFloor(minTip, wheel.price, pickedSoundPrice)`; else `spinDropped: true` in the response. Auto-confirmed tips call `startSpin` after create.
  - `PATCH /api/tips/[id]`: body may include `force: true`. On confirm: if `spinBlocker` says empty and no `force` → 409 `{ error: "wheel_empty" }` without changing status; else update status then `startSpin` (only when moving into CONFIRMED). On reject from CONFIRMED → `cancelSpin`.
- [ ] **Step 1:** Implement `wheel-server.ts` and route changes.
- [ ] **Step 2: Browser/fetch checks** on a local test account: wheel of 2 tasks × 1 slot removing; send 3 tips with spin → confirm #1, #2 (both started, wheel now empty), confirm #3 → 409 `wheel_empty`, with `force` → confirmed, no spin; reject #1 → its spin CANCELLED, segment back (wheel has 1 segment); confirm #1 again → `"restored"`, same `taskText`; fire two confirms in parallel on a wheel with one segment → one spin, one 409.
- [ ] **Step 3:** `npx tsc --noEmit`, `npm test`. Commit `Wheel: spins start on confirm, cancel on reject, restore on re-confirm`.

---

### Task 4: Wheel API and settings page

**Files:** Create `src/app/api/wheels/route.ts`, `src/app/api/wheels/[id]/route.ts`, `src/app/api/wheels/spins/route.ts`, `src/app/[locale]/dashboard/features/wheel/page.tsx`, `src/components/features/WheelPage.tsx`, `src/components/features/WheelPreview.tsx`, `src/components/features/WheelRulesDialog.tsx`, `src/components/features/SpinTodo.tsx`; Modify messages.

**Interfaces — Produces:**
- `GET /api/wheels` → `{ activeWheelId, wheelEnabled, rulesAccepted: boolean, wheels: { id, name, price, slots, removeWhenHit, removed, tasks: {id,text,noAction}[] }[] }`
- `POST /api/wheels` `{ template?: "task"|"reward"|"game", name? }` → `{ id }` (empty wheel when no template: two placeholder tasks "ภารกิจ 1/2"); 409 past `MAX_WHEELS`. First wheel becomes active.
- `PATCH /api/wheels/[id]` any of `{ name, price, slots, removeWhenHit, tasks: {id?, text, noAction}[] (replace, keeps ids), activate: true, reset: true }`; validates limits (slots via `clampSlots`, 400 if over). `DELETE` → 409 `active`.
- `POST /api/wheels/rules` (file `src/app/api/wheels/rules/route.ts`) sets `wheelRulesAcceptedAt` and `wheelEnabled=true`; asset route kind `wheelToggle` turns the card on only if rules accepted (else 409 `rules`).
- `GET /api/wheels/spins?status=open|done` → to-do items `{ id, taskText, fan, amount, confirmedAt, doneAt }` (ACTIVE, not noAction); `PATCH` `{ id, done: boolean }`; done items older than 30 days are not returned.
- `WheelPreview({ tasks, slots, removed, spinTo?: string })` — SVG wheel with segment labels (truncate), colours from a fixed brand palette; used by the page and the overlay (Task 5).
- `SpinTodo({ compact?: boolean })` — open list with "✓ ทำแล้ว", "ทำแล้ว" tab with undo.
- Page: wheel tabs + "+ วงล้อใหม่" (template picker), name, price, removeWhenHit switch, slots **slider** 1–4 with "N ภารกิจ × s = M ช่อง" and cap note, "รีเซ็ตวงล้อ", task rows (text, "ไม่ต้องทำอะไร", delete, faded count of removed copies), "+ เพิ่มภารกิจ", "ใช้วงล้อนี้", delete, preview, wheel + to-do OBS links, test on OBS, `SpinTodo`. Autosave as in project 2 (`AutoSaveInput` from `LibraryBits`).
- [ ] **Step 1:** API routes. **Step 2:** components + page + messages. **Step 3:** browser: create from each template, slider caps at 13 tasks, reset restores, delete active blocked, autosave. **Step 4:** commit `Wheel: settings page, templates, slider, to-do list`.

---

### Task 5: Wheel and to-do overlays

**Files:** Create `src/app/overlay/[username]/wheel/page.tsx`, `src/app/overlay/[username]/todo/page.tsx`, `src/app/api/overlay/[username]/wheel/route.ts`, `src/app/api/overlay/[username]/todo/route.ts`, `src/components/overlay/WheelOverlayClient.tsx`, `src/components/overlay/TodoOverlayClient.tsx`; Modify `src/lib/overlay-test.ts` (wheel test sample).

**Interfaces:**
- Wheel feed `GET …/wheel?key=` → `{ spin: { id, fan, taskText, segmentKey, wheel: { tasks, slots, removedBefore } } | null }`: atomically claims the oldest ACTIVE spin with `playedAt` null and `confirmedAt` within `LATE_PLAY_MS` (`updateMany where playedAt null` then read), so a second overlay gets null. Also returns a pending wheel test (Redis, like alert tests) as a fake spin.
- Overlay: shows `WheelPreview`, spins ~5 s to `segmentKey`, shows "<fan> หมุนได้ <task>!" ~5 s, hides; polls every 3 s; one at a time.
- To-do feed `GET …/todo?key=` → open items (newest last, ≤ 8 + `more` count); client polls 4 s.
- Both use `overlayUser` key check and `touchOverlaySeen`.
- [ ] **Step 1:** build. **Step 2:** browser: confirm a spin with the wheel overlay open → animates once and lands on the recorded task; second wheel tab open → only one animates; spin confirmed while no overlay open, overlay opened within the hour → plays; older (set `confirmedAt` back 2 h via SQL) → doesn't play; to-do overlay updates after ticking. **Step 3:** commit `Wheel: OBS wheel and to-do overlays`.

---

### Task 6: Donate page, hub card, rules, badges

**Files:** Create `src/components/WheelPicker.tsx`; Modify `src/app/[locale]/[username]/page.tsx`, `src/components/TipForm.tsx`, `src/components/SoundPicker.tsx` (shared floor), `src/lib/feature-registry.ts`, `src/lib/feature-presets.ts`, `src/components/features/FeatureHub.tsx`, `src/components/TipList.tsx`, `src/components/TipRow.tsx`, `src/app/[locale]/terms/page.tsx`, `src/app/[locale]/dashboard/page.tsx`, messages.

**Interfaces:**
- `WheelPicker({ wheel: { name, price, odds }, amount, floorWithoutWheel, checked, onChange })` — checkbox card "หมุนวงล้อ <name> · ฿price", disabled with "ทิป ฿X ขึ้นไป" when `amount < floorWithoutWheel + price`, "ดูช่องในวงล้อ (N ช่อง)" expanding `taskOdds` + "ทุกช่องมีโอกาสออกเท่ากัน".
- TipForm: combined floor via `spinFloor`; leaving the amount field clears the spin if amount < floor with spin+sound, then clears the sound if amount < floor with the sound alone (same note as project 2); sends `spinWheel=1`; done screen note on `spinDropped`.
- Hub card `{ id: "wheel", icon: "target", flag: "wheelEnabled", href: "/dashboard/features/wheel", fanPage: true, toggleKind: "wheelToggle", obsPath: "/wheel", obsSize: "600×600" }`; turning on without accepted rules opens `WheelRulesDialog` (3 checkboxes, all required) then the template picker.
- Tips: TipRow badge "วงล้อ: <taskText>" / "วงล้อหมดก่อนหมุน" when confirmed with spinWheelId and no spin; confirm button handles 409 `wheel_empty` with a dialog ("รีเซ็ตวงล้อแล้วยืนยัน" / "ยืนยันโดยไม่หมุน" / ยกเลิก).
- Terms: new section on random features (spec "Rules").
- Dashboard home: `SpinTodo compact` block when there are open items.
- [ ] **Step 1:** build. **Step 2:** browser (375 px + desktop, light/dark): card off hides picker; first enable forces checklist; locked spin can't be ticked at low amount; wheel ฿50 + sound ฿30 locks at ฿79, unlocks at ฿80; tip with spin → confirm → overlay spins → to-do shows; reject → to-do clears. **Step 3:** commit `Wheel: donate-page picker, hub card with rules, tip badges, terms`.

---

### Task 7: Final pass

- [ ] `npm test && npx tsc --noEmit && npm run build`; lint only the 5 existing errors; fresh-DB migration + empty schema diff; full browser flow from template to tick-off; update memory; report rulings, deferred items, and that the feature-hub migrations (now incl. wheels) await the production go-ahead and "merge push".
