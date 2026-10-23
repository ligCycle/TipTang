# Wishlist Goal + Bar Styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The goal becomes either a single goal (today) or a wishlist of up to 10 items fans can choose to help, with stored per-tip allocations, four bar styles, three on-stream display modes, a donate-page picker and badges — plus one shared confirm/reject pipeline for every tip feature.

**Architecture:** Pure rules (allocation/flow, item events, extras floor) in `src/lib/wishlist.ts` with tests. Allocations are stored rows written inside the single tip pipeline (`src/lib/tip-hooks.ts`, ruling R5) under the creator lock. A new `/api/goal` API drives a new goal settings page; the goal overlay and the profile block read one `goalFeed`.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` first), React 19, next-intl, Prisma 7 + hand-written SQL, Tailwind 4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-23-wishlist-goal-design.md` (approved; sections "Decided after the builder check" and "From the master plan" are binding). Master plan: `C:\Users\ggtan\.claude\plans\1-2-drifting-lemur.md`.

## Global Constraints

- Single goal = today's behaviour exactly (fields `goalTitle`, `goalAmount`, `goalStartedAt`, live sum via `goalRaised`). Default type for everyone: single.
- Wishlist: ≤ 10 items; name ≤ 40 chars; price whole baht 1–1,000,000; optional library image; ordered.
- Money already on an item stays; it moves only on: delete of an unfilled item (→ top unfilled item), price lowered below raised (excess → next unfilled item, wrapping), reject (tip's allocations removed). Chosen item first; overflow and no-choice → next/top unfilled item in order; all full → last item past 100%.
- "เริ่มรอบใหม่" zeroes every item (allocations before `goalStartedAt` stop counting), list kept.
- Goal card off → no picker, choice ignored (counts as no choice); profile goal block unchanged.
- Styles: `classic | big | glass | ring` (default classic). Display: `main | all | rotate` (default all; all = up to 4 rows then "+N"; rotate = 8 s each, just-tipped item next).
- Colour chain: goalColor → alertColor → brand pink. OBS link unchanged (`/overlay/<u>/goal`).
- R5: one pipeline `onTipConfirmedTx`/`onTipRejectedTx` (lock Tip, then User once; order wheel → combo → wishlist) with explicit tx `timeout: 15_000, maxWait: 5_000`.
- No emoji, gender-neutral, th/en parity, autosave, no "wishlist" word in Thai UI. Schema folds into `prisma/migrations/20261018000000_feature_hub`. Never touch the production DB. Lint: only the 5 existing errors.

## Review Focus

1. Two tips confirmed at once that both target the last ฿ of an item → one fills it, the other overflows to the next item; totals add up exactly (Task 4 parallel check).
2. Deleting an unfilled item while a tip is being confirmed → no baht lost or doubled (creator lock on both paths, Task 4).
3. A tip rejected after it overflowed → all its allocation rows (on every item) are removed (Task 1 + Task 4).
4. A creator switches multi → single → multi → items and money unchanged; single shows top item (Task 4).
5. Existing creators with a single goal see identical numbers and look on the overlay and profile (Task 6/7 regression check against `goalRaised`).

---

### Task 1: Pure wishlist rules + extras floor

**Files:** Create `src/lib/wishlist.ts`, `src/lib/wishlist.test.ts`; Modify `src/lib/wheel.ts` (`spinFloor` delegates to `extrasFloor`).

**Produces:**
- `MAX_ITEMS=10`, `MAX_ITEM_NAME=40`, `MAX_ITEM_PRICE=1_000_000`; `GOAL_STYLES=["classic","big","glass","ring"]`, `GOAL_DISPLAYS=["main","all","rotate"]` with `isGoalStyle`/`isGoalDisplay`.
- `type ItemState = { id: string; price: number; raised: number }` (list order = priority).
- `allocate(items: ItemState[], amount: number, chosenId: string | null): { itemId: string; amount: number }[]` — chosen (if unfilled) first, then unfilled items in order starting after the chosen one and wrapping (no choice → from the top); leftover → last item.
- `moveOnDelete(items, deletedId): { itemId; amount }[]` (where the deleted item's raised goes; empty when it was full).
- `spillOnPrice(items, itemId, newPrice): { from: string; to: { itemId; amount }[] }` (excess when raised > newPrice).
- `isFull(item)`, `topUnfilled(items)`, `cleanItemName`, `cleanItemPrice`.
- `extrasFloor(creatorMin: number, prices: (number | null)[]): number` = max(creatorMin, Σ non-null prices); `spinFloor(a,b,c)` = `extrasFloor(a,[b,c])` (existing tests stay green).
- [ ] Tests first (`node --test src/lib/wishlist.test.ts`): allocate no-choice → top unfilled; chosen unfilled; chosen full → next unfilled; overflow split across two items; wrap from bottom chosen to top; all full → last item; zero/NaN amounts → []; moveOnDelete unfilled → top unfilled (not itself), full → []; spillOnPrice; extrasFloor sums and floors; clean* bounds. RED → implement → GREEN → commit `Wishlist: pure allocation rules and extras floor`.

### Task 2: One tip pipeline (R5)

**Files:** Create `src/lib/tip-hooks.ts`; Modify `src/app/api/tips/[id]/route.ts`, `src/app/api/tips/route.ts`, `src/lib/combo-server.ts` (accept "already locked"), `src/lib/wheel-server.ts` (callers only).

**Produces:** `onTipConfirmedTx(tx, tipId, now)` / `onTipRejectedTx(tx, tipId, now)` and `TIP_TX = { timeout: 15_000, maxWait: 5_000 }`. Confirm order: wheel spin (`startSpinTx`, keeps its 409 `wheel_empty` contract — the PATCH calls it before the status update as today), status update, then User lock + combo + wishlist (Task 4 adds wishlist). Auto-confirm path (`POST /api/tips`) uses the same functions in one transaction with `TIP_TX`. Combo functions take the tx with the User row already locked (lock helper becomes idempotent per tx or is skipped).
- [ ] Refactor with no behaviour change. Re-run, through the real routes on the local DB: a wheel spin confirm + empty 409; a combo start from 3 fans; reject cancels both. `npx tsc --noEmit`, `npm test`. Commit `Tips: one confirm/reject pipeline for every feature (R5)`.

### Task 3: Schema

**Files:** `prisma/schema.prisma`, `prisma/migrations/20261018000000_feature_hub/migration.sql`.

**Produces:** `User.goalType String @default("single")`, `goalStyle String @default("classic")`, `goalDisplay String @default("all")`; `WishItem { id, userId (Cascade), name, price Int, imageUrl String?, position Int, deletedAt DateTime?, createdAt }` + `@@index([userId, deletedAt])`; `WishAlloc { id, tipId (Tip Cascade), itemId (WishItem Cascade), amount Int, createdAt }` + `@@index([itemId])`, `@@index([tipId])`; `Tip.wishItemId String?` (fan's choice, no FK — item may be deleted later) + index. RLS on both tables. Soft delete keeps a full item's allocations out of the others.
- [ ] Throwaway prisma dev DB: deploy + empty diff; apply to `tiptang-hub2`; generate. Commit `Wishlist: schema in the feature-hub migration`.

### Task 4: Allocation engine + goal API

**Files:** Create `src/lib/goal-server.ts`, `src/app/api/goal/route.ts`, `src/app/api/goal/items/route.ts`, `src/app/api/goal/items/[id]/route.ts`; Modify `src/lib/tip-hooks.ts`, `src/app/api/tips/route.ts` (choice validation), `src/lib/goal.ts` (unchanged single path).

**Produces:**
- `itemStates(tx|db, userId, since: Date | null): ItemState[]` (raised = Σ allocations created ≥ round start, live items only, ordered).
- `wishConfirmTx(tx, tipId, now)`: multi + card on → `allocate` with the tip's `wishItemId` (ignored when card off/invalid) → insert `WishAlloc` rows. `wishRejectTx`: delete the tip's rows.
- Item events under the creator lock: delete (soft; unfilled → move rows' amounts to targets by inserting/adjusting rows; full → just hide), price change (lower → spill), reorder (positions only), create (≤ 10).
- `GET /api/goal` → `{ type, style, display, color, alertColor, single: { title, amount, raised, startedAt }, items: { id, name, price, raised, imageUrl, full }[] }`; `PATCH /api/goal` `{ type?, style?, display? }` (switching to multi with no items creates item 1 from the single title/amount and moves nothing; to single shows top item as the single title/amount — Claude's call per spec); items CRUD routes. Single-goal title/amount/reset/colour keep the existing asset kinds.
- `POST /api/tips`: read `wishItemId`; keep only if goal card on, type multi, item live and unfilled now; else null (no error).
- [ ] Fetch checks on the local account (real routes): no-choice → top item; chosen; overflow split; all full → last; parallel two confirms on the last baht; reject removes rows on two items; delete unfilled moves baht; delete full hides; lower price spills; reorder moves nothing; new round zeroes; card off ignores choice; single goal numbers equal `goalRaised`. Commit `Wishlist: allocation engine and goal API`.

### Task 5: Goal settings page

**Files:** Create `src/components/features/GoalPage.tsx`, `src/components/features/GoalItemsEditor.tsx`; Modify `src/components/features/FeaturePages.tsx` (`GoalFeature` renders `GoalPage`), `src/lib/feature-registry.ts` (description key only), messages.

**Produces:** Page sections: header switch (`goalToggle`); ① ประเภท เป้าเดียว / หลายชิ้น; ② รูปแบบหลอด picker (4 small previews rendered with `GoalView` + sample data) and a large live preview (same component, real data); ③ single: title/amount/reset (existing asset kinds) — or multi: items editor (picture: upload via `uploadFile` or pick from library images; name; price; up/down reorder buttons; delete with a dialog quoting the moved amount via `moveOnDelete`; "+ เพิ่มของ" ≤ 10) and display mode (ชิ้นหลัก / ทุกชิ้น / สลับทีละชิ้น); ④ colour (`ColorField`, kind `goalColor`), OBS link. Autosave through one queue (lesson from combo/wheel pages).
- [ ] Browser at 375 px + desktop, light/dark: switch types, add/edit/reorder/delete items (dialog text), pick each style and display, colour, reset round. Commit `Wishlist: goal settings page with types, styles and items`.

### Task 6: Overlay styles and modes

**Files:** Modify `src/components/overlay/GoalView.tsx` (styles + list/rotate), `src/components/GoalOverlayClient.tsx`, `src/lib/overlay-feed.ts` (`goalState` → `goalFeed`), `src/app/api/overlay/[username]/goal/route.ts`.

**Produces:** `GoalFeed = { enabled; type; style; display; single?: GoalState; items?: { id; name; price; raised; imageUrl; full; lastTipAt }[] }`. Single renders exactly as today in classic (snapshot of class names/markup unchanged). Styles big/glass/ring per mockup `goal-styles-v1.html`. Modes per `wishlist-stream-v1.html`. A "ครบแล้ว! ขอบคุณทุกคน · ฿X จาก N คน" moment when an item turns full between polls (not on first poll).
- [ ] Browser via iframe: each style × single; each mode × multi; full moment once; reload doesn't replay. Commit `Wishlist: goal overlay styles and display modes`.

### Task 7: Donate page, badges, alerts

**Files:** Create `src/components/WishPicker.tsx`; Modify `src/app/[locale]/[username]/page.tsx`, `src/components/TipForm.tsx` (send `wishItemId`, use `extrasFloor`), `src/components/TipList.tsx`, `src/components/TipRow.tsx`, `src/lib/overlay-feed.ts` + `src/components/OverlayClient.tsx` + `src/components/overlay/AlertCard.tsx` (line "ช่วยซื้อ X"), messages.

**Produces:** `WishPicker({ items, value, onChange })` per mockup `wishlist-donate-v1.html` ("ไม่เลือก (เข้าชิ้นหลัก: X)", full items disabled); shown only when card on, multi, ≥ 2 unfilled. Profile block: single = today; multi = compact list (picker hidden) or the one remaining item like today. Tip row badge "ช่วย: X"; alert line uses the item the fan chose.
- [ ] Browser: picker visibility rules, choice reaches the item, badge, alert line, 375 px. Commit `Wishlist: donate-page picker, tip badge and alert line`.

### Task 8: Final pass

- [ ] `npm test && npx tsc --noEmit && npm run build`; lint; parity; fresh-DB migration + empty diff; full browser flow single → multi → tips → full moment → delete/move → reject; opus whole-project review + fix pass; memory update.
