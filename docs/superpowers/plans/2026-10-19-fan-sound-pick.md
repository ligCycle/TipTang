# Fan Sound Pick + Sound Sets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creators group library files into sets, one set is active and drives normal alerts and the sounds fans may pick (each with a minimum tip) on the donate page.

**Architecture:** Pure rules (pools by amount, pick validation, pick-over-tier precedence) live in `src/lib/alert-sets.ts` and are unit-tested. Sets are two new tables plus `User.activeSetId`; the unapplied project-1 migrations are edited so `AlertAsset.inRandom` never ships. The overlay gets the active set's pools at load and refreshes them through the existing alert feed when the set changes; a tip carries the picked sound to the overlay through the same feed.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before writing route/page code), React 19, next-intl (`messages/th.json` + `messages/en.json` in key parity), Prisma 7 + hand-written `migration.sql`, Tailwind 4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-19-fan-sound-pick-design.md`

## Global Constraints

- Projects 1 and 2 ship in one deploy: edit `prisma/migrations/20261018000000_feature_hub` and `20261018000001_feature_hub_media`; no third migration; `AlertAsset.inRandom` is removed everywhere.
- Never run anything against the production DB. `prisma.config.ts` loads `.env` (= production); every Prisma CLI call passes `DIRECT_URL=<local url>` inline and checks the host with `npx prisma migrate status` first. Local DB: prisma dev `tiptang-hub` at `postgres://postgres:postgres@localhost:51218/template1?sslmode=disable` (single connection: stop the dev server before CLI writes).
- UI words creators meet: ชุด, ชุดที่ใช้อยู่, แฟนเลือกได้, ราคาขั้นต่ำ. No emoji (line icons from `src/components/Icon.tsx`). Gender-neutral copy. Every new key in both `th.json` and `en.json`.
- Default set name: `ชุดหลัก`. Limits: 10 sets per creator; set and sound names ≤ 40 characters; minimum per sound whole baht 0–100000 (0 shows as "ฟรี").
- A sound's minimum applies to random plays too: a sound plays only on tips ≥ its minimum. Effective minimum to pick = max(sound minimum, creator `minTipAmount`).
- Locked sounds (minimum above the entered amount) cannot be picked; TipTang never changes the fan's amount.
- Settings save by themselves (switches at once, text/price ~800 ms after typing stops), like the rest of the dashboard.
- Feature card "แฟนเลือกเสียง" is off by default (`User.soundPickEnabled` default false).
- Push only on the founder's "merge push". Lint must not gain errors beyond the 5 existing ones (ColorField, DemoBanner, ImageCropper, NavMenu, ThemeToggle).

## Review Focus

1. A fan picks a sound, then lowers the amount below its minimum → the pick is cleared with a note, and the server never stores a pick the amount doesn't cover (Task 1 `validatePick` tests; Task 6 browser check).
2. The creator switches sets while OBS is running → the next normal alert uses the new set without reloading the OBS source (Task 5 browser check).
3. The creator deletes a library sound that a not-yet-played tip picked → that alert falls back to tier/set sound, nothing errors (Task 2 FK `SetNull`; Task 5 `applyPick(null)` test).
4. Every sound in the active set is priced above a small tip → that alert plays silently and the set view warns "no free sound" (Task 1 `poolsForAmount` test; Task 7 warning).
5. The creator tries to delete the active set or their last set → refused with a clear message, nothing deleted (Task 4 route checks + browser).

---

### Task 1: Pure set rules

**Files:**
- Create: `src/lib/alert-sets.ts`
- Test: `src/lib/alert-sets.test.ts`

**Interfaces:**
- Produces:
  - `MAX_SETS = 10`, `MAX_NAME = 40`, `MAX_PRICE = 100000`, `DEFAULT_SET_NAME = "ชุดหลัก"`
  - `type SetSound = { url: string; minAmount: number }`
  - `type NormalMedia = { sounds: SetSound[]; images: string[]; videos: string[] }`
  - `poolsForAmount(media: NormalMedia, amount: number): { sounds: string[]; images: string[]; videos: string[] }` — sounds with `minAmount <= amount`; images/videos unchanged. Output feeds the existing `pickNormal` in `src/lib/alert-tiers.ts`.
  - `type PickCandidate = { assetId: string; kind: "SOUND" | "STICKER" | "VIDEO"; fanPickable: boolean; minAmount: number }`
  - `validatePick(activeItems: PickCandidate[], assetId: string | null, amount: number, creatorMin: number): { ok: true; assetId: string } | { ok: false; reason: "none" | "unavailable" | "too_low" }` — `"none"` when `assetId` is null/empty.
  - `applyPick<T extends { soundUrl: string | null; videoUrl: string | null }>(media: T, pickedUrl: string | null): T & { videoMuted: boolean }` — picked sound replaces `soundUrl`; `videoMuted` true only when a pick exists and `videoUrl` is set.
  - `cleanName(raw: unknown): string | null` — trimmed, ≤ `MAX_NAME`, null if empty.
  - `cleanPrice(raw: unknown): number | null` — whole number 0..`MAX_PRICE`, else null.

- [ ] **Step 1: Write the failing tests** in `src/lib/alert-sets.test.ts`:
  - `poolsForAmount: keeps sounds at or below the amount` — media sounds `[{url:"a",minAmount:0},{url:"b",minAmount:50},{url:"c",minAmount:100}]`, amount 50 → sounds `["a","b"]`; amount 20 → `["a"]`; images/videos passed through.
  - `poolsForAmount: all sounds priced above → no sounds` — amount 10 with only `minAmount:100` → `[]`.
  - `validatePick: free sound, any amount ≥ creator minimum` → `{ok:true}` for amount 20, creatorMin 20.
  - `validatePick: creator minimum raises a free sound's floor` — price 0, creatorMin 30, amount 20 → `{ok:false, reason:"too_low"}`.
  - `validatePick: below the sound minimum` — price 50, amount 49 → `too_low`; amount 50 → ok.
  - `validatePick: not in set / not pickable / not a sound` → `unavailable` for each.
  - `validatePick: null pick` → `{ok:false, reason:"none"}`.
  - `applyPick: pick overrides tier/set sound`, `applyPick: pick over a video mutes the video`, `applyPick: no pick keeps sound and video unmuted`.
  - `cleanName`/`cleanPrice`: `"  ab "`→`"ab"`, `""`→null, 41 chars→null; `"50"`→50, `1.5`→null, `-1`→null, `100001`→null, `0`→0.

- [ ] **Step 2: Run** `node --test src/lib/alert-sets.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the exports above in `src/lib/alert-sets.ts` (no imports from Prisma or React; plain functions).
- [ ] **Step 4: Run** `node --test src/lib/alert-sets.test.ts` — Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "Sound sets: pure rules for pools, picks and precedence"`

---

### Task 2: Schema and migrations (edit the unapplied ones)

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/migrations/20261018000000_feature_hub/migration.sql`, `prisma/migrations/20261018000001_feature_hub_media/migration.sql`

**Interfaces:**
- Produces (Prisma names later tasks use):
  - `AlertAsset`: remove `inRandom`; add `name String?`; relations `setItems AlertSetItem[]`, `pickedBy Tip[]`.
  - `model AlertSet { id String @id @default(cuid()); userId String; user User @relation(..., onDelete: Cascade); name String; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; items AlertSetItem[]; activeFor User[] @relation("ActiveSet"); @@index([userId]) }`
  - `model AlertSetItem { setId String; assetId String; fanPickable Boolean @default(true); minAmount Int @default(0); set AlertSet @relation(..., onDelete: Cascade); asset AlertAsset @relation(..., onDelete: Cascade); @@id([setId, assetId]) }`
  - `User`: `activeSetId String? @unique` with `activeSet AlertSet? @relation("ActiveSet", fields: [activeSetId], references: [id], onDelete: SetNull)`; `soundPickEnabled Boolean @default(false)`; `alertSets AlertSet[]`.
  - `Tip`: `pickedSoundId String?`, `pickedSound AlertAsset? @relation(fields: [pickedSoundId], references: [id], onDelete: SetNull)`.

- [ ] **Step 1: Edit `schema.prisma`** as above; update the comments that mention `inRandom`.
- [ ] **Step 2: Edit `20261018000000_feature_hub/migration.sql`:** drop the `inRandom` column add; add `AlertAsset.name`, the two tables (with FKs as above), `User.activeSetId` (unique, FK `ON DELETE SET NULL`), `User.soundPickEnabled`, `Tip.pickedSoundId` (FK `ON DELETE SET NULL`); `ENABLE ROW LEVEL SECURITY` on both new tables, like `AlertTier`.
- [ ] **Step 3: Rewrite `20261018000001_feature_hub_media/migration.sql`** so "ชุดหลัก" holds exactly what plays today. Use deterministic ids (`'set_' || u.id`, `'mig_snd_' || u.id`, `'mig_img_' || u.id`, `'mig_vid_' || u.id`). Order and rules:
  1. Create one set per user: id `'set_'||id`, name `'ชุดหลัก'`; set `User.activeSetId` to it.
  2. Pre-existing library SOUND/STICKER rows → items of that set, **unless** the user has `alertVideoUrl`.
  3. Move main files into the library (as today, without `inRandom`); add as items: main video always; main image only if no `alertVideoUrl` and no pre-existing library STICKER; main sound only if no `alertVideoUrl` and no pre-existing library SOUND.
  4. Items default `fanPickable = true`, `minAmount = 0`.
- [ ] **Step 4: Verify on a fresh throwaway DB** (same method as the project-1 check): `npx prisma dev --name tiptang-mig --detach`; with `DIRECT_URL` set to it, confirm `migrate status` shows its host; hold the two new migration folders aside, `migrate deploy`, seed users A–D (A: main sound+image, bigTip 300; B: library sticker + main image; C: main video + main image + library sound; D: nothing, no overlayKey), put the folders back, `migrate deploy`, then query. Expected: every user has an active "ชุดหลัก"; A's set = main sound + main image; B's = library sticker only (main image in library, not in set); C's = main video only; D's set empty; A has one celebrating tier at 300. Then `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `-- This is an empty migration.` Remove the throwaway DB.
- [ ] **Step 5: Re-apply to the local dev DB:** drop and recreate `tiptang-hub` (or reset it) with both migrations, then `npx prisma generate`. Re-register a throwaway account for later browser checks (password stored only in the pane's localStorage).
- [ ] **Step 6: Run** `npx tsc --noEmit` — Expected: errors only where `inRandom` is still referenced (fixed in Task 3). Commit `git commit -m "Sound sets: schema; fold into the feature-hub migrations; drop inRandom"`

---

### Task 3: Server helpers, library API and uploads

**Files:**
- Create: `src/lib/alert-sets-server.ts`
- Modify: `src/app/api/overlay/setup/route.ts`, `src/app/api/overlay/asset/route.ts`, `src/components/OverlaySettings.tsx` (types only), `src/components/features/AlertTiersSection.tsx` (upload field)

**Interfaces:**
- Consumes: Task 1 constants/cleaners; Task 2 models.
- Produces:
  - `getActiveSetId(userId: string): Promise<string>` — returns `User.activeSetId`, creating and activating a `DEFAULT_SET_NAME` set if null (new sign-ups after deploy).
  - `activeSetMedia(userId: string): Promise<{ version: string; normal: NormalMedia }>` — `version = \`${setId}:${set.updatedAt.getTime()}\``.
  - `touchSet(setId: string): Promise<void>` — bumps `updatedAt` (call after any item change).
  - Setup API library items become `{ id, url, name: string | null }` (no `inRandom`); response adds `soundPickEnabled`, `activeSetId`.
  - Asset route: library upload accepts optional form field `addToActive=1` → after creating the asset, add an item to the active set (fanPickable true, minAmount 0) and `touchSet`; without it, no set. New kind `libraryName` (`assetId`, `name` → `cleanName`, own asset only). New kind `soundPickToggle` (`enabled` "1"/"0" → `User.soundPickEnabled`). Remove kind `libraryRandom`. Record the uploaded file's original name (without extension, cleaned) as `AlertAsset.name`.

- [ ] **Step 1:** Implement `src/lib/alert-sets-server.ts` (`import "server-only"`).
- [ ] **Step 2:** Update the setup route, asset route and the `LibItem` type in `OverlaySettings.tsx`; `AlertTiersSection` stops sending `inRandom` (tier uploads simply omit `addToActive`).
- [ ] **Step 3: Run** `npx tsc --noEmit` — Expected: remaining errors only in files Tasks 5–8 rewrite (overlay page, AlertPreview, LibraryPage, NormalMediaSummary). List them in the commit message.
- [ ] **Step 4: Commit** `git commit -m "Sound sets: server helpers, library names, upload-to-active, feature toggle"`

---

### Task 4: Sets API

**Files:**
- Create: `src/app/api/overlay/sets/route.ts`, `src/app/api/overlay/sets/[id]/route.ts`

**Interfaces:**
- Consumes: Task 1 (`cleanName`, `cleanPrice`, `MAX_SETS`), Task 3 (`getActiveSetId`, `touchSet`).
- Produces (all session-only via `requireUser`, all ids checked against the user):
  - `GET /api/overlay/sets` → `{ activeSetId: string, sets: { id, name, items: { assetId, fanPickable, minAmount }[] }[] }`
  - `POST /api/overlay/sets` body `{ name, copyFromId?: string, items: { assetId, fanPickable?: boolean, minAmount?: number }[], activate?: boolean }` → `{ id }`; 409 `too_many` past `MAX_SETS`; 400 `invalid` for bad name/price/foreign asset.
  - `PATCH /api/overlay/sets/[id]` body any of `{ name, activate: true, items: [...] (replaces all), item: { assetId, fanPickable?, minAmount? } (one row upsert), removeAssetId }` → `{ ok: true }`; calls `touchSet` on item changes.
  - `DELETE /api/overlay/sets/[id]` → 409 `active` if it is the active set, 409 `last` if it is the only set.
  - Every write calls `revalidatePath("/overlay/[username]", "page")`.

- [ ] **Step 1:** Implement both route files (read the App Router route-handler doc in `node_modules/next/dist/docs/` first; dynamic `params` is a Promise).
- [ ] **Step 2: Verify with fetch from the signed-in pane** (local dev): create a set with two items, set one price to 50, activate it, try deleting it (expect 409 `active`), switch back, delete it (expect 200), try deleting the last set (expect 409 `last`), send a foreign asset id (expect 400).
- [ ] **Step 3: Commit** `git commit -m "Sound sets: sets API"`

---

### Task 5: Overlay plays sets and picks

**Files:**
- Modify: `src/app/overlay/[username]/page.tsx`, `src/components/OverlayClient.tsx`, `src/components/overlay/AlertCard.tsx`, `src/lib/overlay-feed.ts`, `src/app/api/overlay/[username]/route.ts`, `src/lib/alert-tiers.test.ts` (only if `pickNormal` call sites change)

**Interfaces:**
- Consumes: Task 1 `poolsForAmount`, `applyPick`, `NormalMedia`; Task 3 `activeSetMedia`.
- Produces:
  - `OverlayClient` props: `normal: NormalMedia`, `mediaVersion: string`, `libraryAll: string[]` (unchanged meaning).
  - `FeedTip` gains `soundUrl: string | null` (the picked sound's URL, null if none or deleted).
  - Alert feed accepts `?v=<mediaVersion>` and, when the active set's version differs, adds `media: { version: string; normal: NormalMedia }` to the response.
  - `AlertCard` prop `videoMuted?: boolean`.

- [ ] **Step 1:** Overlay page loads `activeSetMedia(user.id)` and passes `normal` + `mediaVersion`; `libraryAll` = all the user's asset URLs (tiers may use any file).
- [ ] **Step 2:** In `pump()`: `resolveAlert({ ...pickNormal(poolsForAmount(normal, amount)), durationSec }, tier, lib)` then `applyPick(result, next.soundUrl)`; pass `videoMuted` to `AlertCard`; preloading covers `normal.sounds[].url` and images.
- [ ] **Step 3:** Feed: select `pickedSound: { select: { url: true } }` on tips; shop orders and tests get `soundUrl: null`; the client sends its current version and swaps `normal` when `media` arrives.
- [ ] **Step 4: Run** `npm test` and `npx tsc --noEmit` — Expected: pass (except LibraryPage/AlertPreview/NormalMediaSummary errors until Tasks 7–8).
- [ ] **Step 5: Browser check** (alerts link open in the pane): send a ฿20 test and a ฿500 test with a set containing a free sound and a ฿100 sound → ฿20 never uses the ฿100 sound (repeat 5×, read the `Audio` src via a temporary `console.log` you remove afterwards, or by inspecting preload/requests); switch the active set via the API while the overlay stays open → the next test uses the new set's files without reloading.
- [ ] **Step 6: Commit** `git commit -m "Overlay: random by active set and amount; fan pick wins; set changes apply live"`

---

### Task 6: Donate page picker and tip validation

**Files:**
- Create: `src/components/SoundPicker.tsx`
- Modify: `src/app/[locale]/[username]/page.tsx`, `src/components/TipForm.tsx`, `src/app/api/tips/route.ts`, `src/components/TipRow.tsx`, `src/components/TipList.tsx`, `messages/th.json`, `messages/en.json`

**Interfaces:**
- Consumes: Task 1 `validatePick`, `PickCandidate`; Task 3 `getActiveSetId`.
- Produces:
  - Page passes `soundChoices: { id: string; name: string; url: string; minAmount: number }[] | null` and `soundSetName: string | null` to `TipForm` — non-null only when `soundPickEnabled && alertsEnabled` and the active set has ≥1 fan-pickable sound. Unnamed sounds get "เสียง N" by library order.
  - `SoundPicker({ choices, setName, amount, creatorMin, value, onChange })` — preview button per sound (one `Audio` at a time), name, "ฟรี"/"฿X"; disabled when `amount < max(minAmount, creatorMin)` with label "ทิป ฿X ขึ้นไป"; tapping the selected one unselects; hint lines: no pick = random from today's set, and sounds play while the creator is live.
  - `TipForm`: holds `pickedSoundId`; when `amount` drops below the picked sound's effective minimum, clears it and shows a one-line note; sends `pickedSoundId` in the form data; done screen shows a note when the response has `pickDropped: true`.
  - Tips route: reads `pickedSoundId`, loads the active set's items, `validatePick(...)`; stores `pickedSoundId` only on `ok`; responds `pickDropped: true` when a non-empty pick failed.
  - TipList selects `pickedSound { name }`; TipRow shows a small "เสียง: <name>" badge when present.

- [ ] **Step 1:** Build `SoundPicker` and wire it into `TipForm` (below the amount, above the message).
- [ ] **Step 2:** Server: page query + tips route validation + TipList/TipRow badge; messages in both languages.
- [ ] **Step 3: Run** `npx tsc --noEmit`, `npm test` — Expected: pass apart from Task 7–8 files.
- [ ] **Step 4: Browser check** on the throwaway account's donate page (mobile 375 px and desktop, light and dark): picker hidden while the card is off; on, it lists only fan-pickable sounds of the active set; amount ฿20 → the ฿50 sound is disabled and can't be selected; pick the ฿50 at ฿50, lower to ฿20 → pick cleared with note; submit a tip with a pick (local slip test image) → TipRow shows the badge; deactivate that sound's set between page load and submit → tip succeeds with `pickDropped` note.
- [ ] **Step 5: Commit** `git commit -m "Donate page: fans pick a sound from today's set; server checks the price"`

---

### Task 7: Library page with sets and the create-set window

**Files:**
- Rewrite: `src/components/features/LibraryPage.tsx`
- Create: `src/components/features/SetEditor.tsx`, `src/components/features/CreateSetDialog.tsx`
- Modify: `messages/th.json`, `messages/en.json`

**Interfaces:**
- Consumes: Task 3 setup API (`library…` items with `name`), Task 4 sets API, Task 1 limits.
- Produces: `SetSwitcher` is NOT here (Task 8). `LibraryPage` exports unchanged name.

- [ ] **Step 1:** Tabs: "ทั้งหมด" + one per set (active shows "ใช้อยู่") + "+ สร้างชุด". "ทั้งหมด": upload (sends `addToActive=1` for sounds/images, not videos), rename (`libraryName`, autosave), delete (existing confirm), tags "ใช้ใน ฿X+" (tiers) and the set names a file is in. The old per-file "ใช้ในแจ้งเตือนปกติ" switch is gone.
- [ ] **Step 2:** `SetEditor` (one set): rows per file; sounds have the "แฟนเลือกได้" switch and the price box (autosave via `PATCH item`); images/GIFs/videos show they're in the set; remove-from-set; "+ เพิ่มไฟล์เข้าชุดนี้" (pick from library or upload then add); rename (autosave), "ใช้ชุดนี้", delete (disabled with reason for active/last). Warning line when the set has no sound priced 0: "ทิปที่ต่ำกว่าราคาทุกเสียงในชุดนี้จะไม่มีเสียง".
- [ ] **Step 3:** `CreateSetDialog`, two steps exactly as `create-set-v1.html`: name + start-from (empty / copy of a set) + tick files (filters all/sounds/images/videos) + upload inside; step 2 sound switches/prices + "ใช้เลยตอนนี้"/"เก็บไว้ก่อน" → `POST /api/overlay/sets`.
- [ ] **Step 4: Run** `npx tsc --noEmit` and `npx eslint src/components/features` — Expected: no new errors.
- [ ] **Step 5: Browser check** (light/dark, 375 px and desktop): create "เกมผี" from 3 files with one price 100, keep for later; activate it from its tab; rename a sound and see the name on the donate page; try deleting the active set (blocked with reason).
- [ ] **Step 6: Commit** `git commit -m "Library: sets as tabs, per-set prices, create-set window"`

---

### Task 8: Hub card, set switcher and alerts summary

**Files:**
- Create: `src/components/features/SetSwitcher.tsx`, `src/components/features/ActiveSetSummary.tsx`
- Delete: `src/components/features/NormalMediaSummary.tsx`
- Modify: `src/lib/feature-registry.ts`, `src/lib/feature-presets.ts` (type only), `src/components/features/FeatureCard.tsx`, `src/components/features/FeatureHub.tsx`, `src/components/OverlaySettings.tsx` (section ③), `src/components/features/AlertPreview.tsx`, `src/app/[locale]/dashboard/page.tsx`, `messages/th.json`, `messages/en.json`

**Interfaces:**
- Consumes: Task 4 sets API; Task 1 `poolsForAmount`.
- Produces:
  - Registry entry `{ id: "soundpick", icon: "volume", flag: "soundPickEnabled", href: "/dashboard/library", fanPage: true, toggleKind: "soundPickToggle", obsPath: null, obsSize: "" }`; `obsPath` type becomes `"" | "/goal" | "/timer" | null`; `FeatureCard` hides the OBS copy row when `obsPath` is null. `FeatureFlags` gains `soundPickEnabled` (presets don't list it). Messages `f_soundpick` "แฟนเลือกเสียง", `d_soundpick` "แฟนเลือกเสียงจากชุดวันนี้ตอนโดเนท".
  - `SetSwitcher()` — "ชุดเสียงไลฟ์วันนี้" + select of sets; change → `PATCH /api/overlay/sets/[id]` `{ activate: true }`; loads via `GET /api/overlay/sets`.
  - `ActiveSetSummary({ config })` — active set name, counts (images/sounds/videos), the switcher, link "จัดการชุดในคลัง".
  - `AlertPreview` uses the active set's media for the selected amount via `poolsForAmount` + `pickNormal(…, () => 0)`.

- [ ] **Step 1:** Registry/card/flags; setup API already returns `soundPickEnabled` (Task 3); `loadHub` maps it.
- [ ] **Step 2:** `SetSwitcher` on the hub (under the OBS card) and on the dashboard home (under the donate-page link); `ActiveSetSummary` replaces section ③'s summary; `AlertPreview` updated.
- [ ] **Step 3: Run** `npx tsc --noEmit`, `npm test`, `npm run lint` — Expected: tsc clean, all tests pass, lint shows only the 5 pre-existing errors.
- [ ] **Step 4: Browser check:** card off by default; turning it on shows the picker on the donate page; switcher on hub and home changes the active set (library tab badge follows); alerts preview at ฿20 vs ฿500 respects prices.
- [ ] **Step 5: Commit** `git commit -m "Hub: fan sound pick card, set switcher, active-set summary"`

---

### Task 9: Final pass

- [ ] **Step 1: Run** `npm test && npx tsc --noEmit && npm run build` — Expected: all succeed; `npm run lint` only the 5 pre-existing errors.
- [ ] **Step 2: Repeat the Task 2 fresh-DB migration check** against the final migrations (schema diff empty).
- [ ] **Step 3: Browser pass** (light/dark, 375 px/desktop): the whole flow — create set → price a sound → turn the card on → fan picks on the donate page → confirm tip → OBS alerts link plays it; old OBS links for goal/timer unchanged; dashboard pages from project 1 still clean in the console.
- [ ] **Step 4:** Update the project memory note and report to the founder: what shipped, the two migrations (now containing sets) that need their production go-ahead, and that push waits for "merge push".
