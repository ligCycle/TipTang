# Feature Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-page "OBS overlay" settings with a grouped dashboard menu, a "ลูกเล่น" hub of on/off feature cards with per-feature settings pages, alert tiers by amount, a single OBS link that shows every enabled feature from one poll, a test-on-OBS button, and a one-time first-visit chooser.

**Architecture:** Pure decision logic (tier choice, anchors, presets, poll cursor, test-signal store) lives in small `src/lib/` modules with `node --test` tests. The three overlay clients are split into presentational views plus their existing self-polling wrappers, so the old routes keep working unchanged while a new `/overlay/[username]/live` page renders the same views from one combined poll. The 1,500-line `OverlaySettings.tsx` is split into a data hook and section components first (no visible change), then those sections are mounted on new routes under `/dashboard/features`.

**Tech Stack:** Next.js 16 App Router, React 19, next-intl 4 (messages in `messages/th.json` + `messages/en.json`), Prisma 7 + Postgres (hand-written `migration.sql`), Upstash Redis (`@upstash/redis`, in-process fallback when env is unset), Tailwind, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-18-feature-hub-design.md` (approved 2026-10-18). Read it before Task 1.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing route/page code (AGENTS.md: "This is NOT the Next.js you know").
- Existing overlay URLs (`/overlay/[username]`, `/overlay/[username]/goal`, `/overlay/[username]/timer`) must keep rendering what they render today; the only behaviour they gain is alert tiers, the test signal, and respecting the new alert switch (default on).
- No emoji in UI. Icons only via `src/components/Icon.tsx` (line icons); add new icon paths there if needed.
- All user-visible copy in `messages/th.json` and `messages/en.json` (same keys in both); Thai primary; gender-neutral (no ครับ/ค่ะ).
- Every new page works in dark mode and under the creator colour theme (`CreatorTheme`).
- Schema changes: hand-write `prisma/migrations/20261018000000_feature_hub/migration.sql` (UTF-8), apply locally with `npx prisma migrate deploy` + `npx prisma generate` against the local dev DB only. **Never run against production; the founder runs the production migration.**
- Tiers: max **5**, minimum amount is a whole baht ≥ 1, unique per creator; a tier may override **sound**, **visual** (image or video, replacing the normal visual entirely) and **time on screen**; nothing else.
- Default positions on the single link: alerts `center`, goal `bottom-center`, timer `top-right`. Alerts always render above other widgets.
- Test signal: Upstash Redis key per creator, TTL **15 s**, never deleted on read, each test has an id; nothing test-related is written to Postgres.
- The single-link page makes **one** poll (every 3 s) for alerts + goal + timer + test; old routes keep their own pollers.
- A preset only switches features on; it never switches anything off or changes other settings. The first-visit popup shows once per account (`featuresOnboardedAt`).
- Push/deploy only when the founder says "merge push". Commit after every task.

## Review Focus

1. **Alerts switched off, then on, mid-stream** — tips that arrived while off must not replay as a burst when switched back on. Pinned by `nextCursor` tests (Task 2) and used by both feeds (Tasks 4, 7).
2. **A tip exactly equal to a tier minimum** — gets that tier, not the one below. Pinned in Task 1.
3. **Creator keeps the old alert link and adds the single link** — the alert would play twice. The hub's OBS card tells them to remove the old sources after adding the single link (copy check in Task 10); both still show the same test (Task 4 test: second read returns the same id).
4. **A library asset used by a tier is deleted** — the tier falls back to the normal sound/visual instead of a broken URL. Pinned by `resolveAlert` tests (Task 1) and the delete handler clearing tier references (Task 12).
5. **Two features on the same anchor** — the settings page warns, and the alert still renders on top. Pinned by `sharedAnchors` tests (Task 2) and z-order in Task 7.

---

### Task 1: Alert tier logic

**Files:**
- Create: `src/lib/alert-tiers.ts`
- Test: `src/lib/alert-tiers.test.ts`

**Interfaces:**
- Produces:
  - `export const MAX_TIERS = 5`
  - `export type AlertTier = { minAmount: number; soundUrl: string | null; imageUrl: string | null; videoUrl: string | null; durationSec: number | null }`
  - `export function pickTier(tiers: AlertTier[], amount: number): AlertTier | null` — the tier with the highest `minAmount` ≤ `amount`; `null` below the lowest tier.
  - `export type AlertBase = { soundUrl: string | null; imageUrl: string | null; videoUrl: string | null; durationSec: number }`
  - `export function resolveAlert(base: AlertBase, tier: AlertTier | null, libraryUrls: Set<string>): AlertBase` — overrides only non-null tier fields whose URL is still in `libraryUrls`; a tier visual (image or video) replaces both base visual fields.
  - `export function normalizeTiers(input: unknown): { ok: true; tiers: AlertTier[] } | { ok: false; error: "too_many" | "invalid" | "duplicate" }` — sorts ascending by `minAmount`; rejects > 5, non-integer or < 1 amounts, duplicate amounts, `durationSec` outside 3–60.
- Base alert duration today is the 7000 ms timeout in `OverlayClient.pump()`; `AlertBase.durationSec` default is `7`.

- [ ] **Step 1: Write the failing tests** in `src/lib/alert-tiers.test.ts`:
  - `pickTier: exact minimum picks that tier` — tiers at 100 and 500; `pickTier(t, 500).minAmount === 500`, `pickTier(t, 499.99).minAmount === 100`.
  - `pickTier: below lowest tier returns null` — `pickTier(t, 99) === null`; `pickTier([], 1000) === null`.
  - `resolveAlert: only overridden fields change` — base `{soundUrl:"a.mp3", imageUrl:"a.png", videoUrl:null, durationSec:7}`, tier `{soundUrl:"b.mp3", imageUrl:null, videoUrl:null, durationSec:null}` → sound `"b.mp3"`, image `"a.png"`, duration `7`.
  - `resolveAlert: tier video replaces base image` — base image `"a.png"`, tier video `"v.mp4"` → `{imageUrl:null, videoUrl:"v.mp4"}`.
  - `resolveAlert: deleted library asset falls back` — tier sound `"gone.mp3"` not in `libraryUrls` → base sound kept.
  - `normalizeTiers: rejects six tiers` → `{ ok:false, error:"too_many" }`; `rejects 0 and 12.5` → `"invalid"`; `rejects two tiers at 100` → `"duplicate"`; `sorts ascending` → `[100, 500]` from `[500, 100]`.
- [ ] **Step 2: Run** `node --test src/lib/alert-tiers.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the four exports in `src/lib/alert-tiers.ts`.
- [ ] **Step 4: Run** `node --test src/lib/alert-tiers.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/lib/alert-tiers.* && git commit -m "Alert tiers: pure tier choice and validation"`

---

### Task 2: Layout, presets and poll cursor logic

**Files:**
- Create: `src/lib/overlay-layout.ts`, `src/lib/feature-presets.ts`, `src/lib/overlay-cursor.ts`
- Test: `src/lib/overlay-layout.test.ts`, `src/lib/feature-presets.test.ts`, `src/lib/overlay-cursor.test.ts`

**Interfaces:**
- Produces (`overlay-layout.ts`):
  - `export const ANCHORS = ["top-left","top-center","top-right","middle-left","center","middle-right","bottom-left","bottom-center","bottom-right"] as const`
  - `export type Anchor = (typeof ANCHORS)[number]`; `export function isAnchor(v: unknown): v is Anchor`
  - `export type OnScreenFeature = "alert" | "goal" | "timer"`
  - `export const DEFAULT_POSITIONS: Record<OnScreenFeature, Anchor> = { alert: "center", goal: "bottom-center", timer: "top-right" }`
  - `export function anchorClasses(a: Anchor): string` — Tailwind classes placing an absolutely-positioned box in a 1920×1080 stage (e.g. `top-8 left-1/2 -translate-x-1/2` for `top-center`).
  - `export function sharedAnchors(p: Partial<Record<OnScreenFeature, Anchor>>, enabled: Partial<Record<OnScreenFeature, boolean>>): OnScreenFeature[][]` — groups of 2+ enabled features on the same anchor.
- Produces (`feature-presets.ts`):
  - `export type FeatureFlags = { alertsEnabled: boolean; goalOverlayEnabled: boolean; timerEnabled: boolean }`
  - `export const PRESETS = { basic: ["alertsEnabled"], goal: ["alertsEnabled","goalOverlayEnabled"], subathon: ["alertsEnabled","goalOverlayEnabled","timerEnabled"] } as const`; `export type PresetId = keyof typeof PRESETS`
  - `export function presetChanges(current: FeatureFlags, preset: PresetId): Partial<FeatureFlags>` — only keys that go false→true.
- Produces (`overlay-cursor.ts`):
  - `export function nextCursor(prev: string, tipTimes: (string | null)[], serverNow: string, alertsEnabled: boolean): string` — when alerts are off, returns `serverNow` (so the backlog never replays); otherwise the latest of `prev` and the tip times.

- [ ] **Step 1: Write the failing tests:**
  - `isAnchor` accepts all 9, rejects `"middle"` and `null`; `DEFAULT_POSITIONS.alert === "center"`; `anchorClasses` returns a distinct string for each anchor.
  - `sharedAnchors({alert:"center",goal:"center",timer:"top-right"}, {alert:true,goal:true,timer:true})` deep-equals `[["alert","goal"]]`; with `goal:false` → `[]`.
  - `presetChanges({alertsEnabled:true,goalOverlayEnabled:false,timerEnabled:true}, "subathon")` deep-equals `{ goalOverlayEnabled: true }`; `presetChanges(all true, "basic")` deep-equals `{}` (never switches off).
  - `nextCursor("T1", ["T3"], "T9", true) === "T3"`; `nextCursor("T1", [], "T9", false) === "T9"`; `nextCursor("T5", ["T3", null], "T9", true) === "T5"` (ISO strings compare lexically — use real ISO values in the test).
- [ ] **Step 2: Run** `node --test src/lib/overlay-layout.test.ts src/lib/feature-presets.test.ts src/lib/overlay-cursor.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the exports above.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Feature hub: anchors, presets and poll cursor logic"`

---

### Task 3: Schema migration (local only)

**Files:**
- Modify: `prisma/schema.prisma` (User model ~lines 207–255; enum `AlertAssetKind` line 42)
- Create: `prisma/migrations/20261018000000_feature_hub/migration.sql`

**Interfaces:**
- Produces on `User`: `alertsEnabled Boolean @default(true)`, `alertPosition String @default("center")`, `goalPosition String @default("bottom-center")`, `timerPosition String @default("top-right")`, `featuresOnboardedAt DateTime?`, relation `alertTiers AlertTier[]`.
- Produces model `AlertTier { id String @id @default(cuid()); userId String; user User @relation(..., onDelete: Cascade); minAmount Int; soundUrl String?; imageUrl String?; videoUrl String?; durationSec Int?; createdAt DateTime @default(now()); @@unique([userId, minAmount]) }`.
- Produces enum value `AlertAssetKind.VIDEO` (library videos are used only by tiers; the base alert's random pick keeps using SOUND and STICKER only).
- Tier URLs always point at the creator's `AlertAsset` URLs, so account erasure (`src/app/api/account/route.ts`, which deletes every `alertAssets` URL) already covers tier files — no change there.
- Existing creators who already set up an overlay (`overlayKey IS NOT NULL`) must not see the first-visit popup: the migration sets `featuresOnboardedAt = NOW()` for them.

- [ ] **Step 1: Edit `schema.prisma`** with the fields, model and enum value above, each with a one-line comment in the file's existing style.
- [ ] **Step 2: Write `migration.sql`**: `ALTER TABLE "User" ADD COLUMN ...` for the five columns, `CREATE TABLE "AlertTier"` with FK `ON DELETE CASCADE` and the unique index, `ALTER TYPE "AlertAssetKind" ADD VALUE 'VIDEO'`, `UPDATE "User" SET "featuresOnboardedAt" = NOW() WHERE "overlayKey" IS NOT NULL`, and `ALTER TABLE "AlertTier" ENABLE ROW LEVEL SECURITY` (matching `20260930000000_security_hardening`).
- [ ] **Step 3: Apply locally** `npx prisma migrate deploy && npx prisma generate` (local dev DB) — Expected: "1 migration applied", client regenerated.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm test` — Expected: no errors, all tests pass.
- [ ] **Step 5: Commit** `git commit -m "Schema: alert tiers, feature positions, alert switch, onboarding flag"` (do not deploy).

---

### Task 4: Test signal store, test API, and alert-feed changes

**Files:**
- Create: `src/lib/overlay-test.ts`, `src/lib/overlay-test.test.ts`, `src/app/api/overlay/test/route.ts`
- Modify: `src/app/api/overlay/[username]/route.ts`

**Interfaces:**
- Consumes: `nextCursor` (Task 2).
- Produces (`overlay-test.ts`, Redis via `Redis.fromEnv()` when the same env check as `src/lib/ratelimit.ts` passes, else an in-process `Map` with expiry):
  - `export type TestAlert = { id: string; amount: number; name: string; message: string }`
  - `export async function pushTestAlert(userId: string, amount: number, now?: number): Promise<TestAlert>` — key `tiptang/test/<userId>`, TTL 15 s, fresh id each call.
  - `export async function readTestAlert(userId: string, now?: number): Promise<TestAlert | null>` — does not delete.
- Produces API `POST /api/overlay/test` (session via `auth()`; body `{ amount: number }`, whole baht 1–100000; rate limit `overlay-test:<userId>` 10 per 60 s via `rateLimit`) → `200 { ok: true, id }`, `401`, `400 invalid`, `429 rate_limited`.
- Alert feed `GET /api/overlay/[username]` response gains `test: TestAlert | null` and `cursor: string` (ISO, from `nextCursor`); when `alertsEnabled` is false it returns `tips: []`. Sample name/message: `"ผู้สนับสนุนตัวอย่าง"` / `"ทดสอบแจ้งเตือน"`, kept as constants in `overlay-test.ts` (overlay text is Thai-only today, like the existing `"ผู้ไม่ประสงค์ออกนาม"`).

- [ ] **Step 1: Write failing tests** (memory path; no Upstash env in tests): `pushTestAlert` then `readTestAlert` returns the same id; a second `readTestAlert` still returns it (not consumed); `readTestAlert(u, now + 16_000)` returns `null`; two pushes give different ids.
- [ ] **Step 2: Run** `node --test src/lib/overlay-test.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `overlay-test.ts`, the `POST /api/overlay/test` route, and the feed changes (select `alertsEnabled`; add `test` and `cursor`).
- [ ] **Step 4: Run** `node --test src/lib/overlay-test.test.ts && npx tsc --noEmit` — Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `git commit -m "Overlay: test-alert signal (Redis, 15 s) and alert switch in the feed"`

---

### Task 5: Alert overlay — card extraction, tiers, test alerts, external feed

**Files:**
- Create: `src/components/overlay/AlertCard.tsx`
- Modify: `src/components/OverlayClient.tsx`, `src/app/overlay/[username]/page.tsx`

**Interfaces:**
- Consumes: `pickTier`, `resolveAlert`, `AlertTier` (Task 1); feed fields `test`, `cursor` (Task 4).
- Produces:
  - `export function AlertCard(props: { name: string; amount: number; message: string | null; timerDelta?: number | null; color: string | null; alertStyle: string; alertTheme: string; isBig: boolean; imageUrl: string | null; videoUrl: string | null }): JSX.Element` — the card markup currently inline in `OverlayClient` (no positioning wrapper, no confetti).
  - `OverlayClient` new props: `tiers: AlertTier[]`, `feed?: { tips: FeedTip[]; test: TestAlert | null } | null` (when present the component does not poll; it enqueues from `feed` whenever it changes), `positionClass?: string` (when present replaces the current `left-1/2 top-6 -translate-x-1/2` wrapper classes).
  - `export type FeedTip = { id: string; supporterName: string; message: string | null; amount: number; confirmedAt: string | null; timerDelta: number | null }` (exported from `OverlayClient.tsx`).
- Behaviour: each dequeued alert resolves its sound/visual/duration with `resolveAlert(base, pickTier(tiers, amount), libraryUrls)`; the library-random pick still happens when no tier overrides that field. Test alerts are enqueued by id (seen-set dedupe) and never carry `timerDelta`. Own polling uses the server `cursor` for `after`. Existing `?test=1` preview loop unchanged.
- The page passes `tiers` from `prisma.alertTier.findMany({ where: { userId }, orderBy: { minAmount: "asc" } })`.

- [ ] **Step 1: Extract** `AlertCard` and make `OverlayClient` render it; run `npx tsc --noEmit` — Expected: no errors.
- [ ] **Step 2: Add** tiers, test alerts, cursor and the `feed`/`positionClass` props.
- [ ] **Step 3: Verify in the browser** (`preview_start tiptang-dev`, local DB, a throwaway creator): open the old alert link with `&test=1` — the looping preview looks exactly as before (normal + SUPER TIP); with a tier at ฿500 that sets a different sound, the ฿1,000 preview plays the tier sound. Press the API `POST /api/overlay/test` (from the dashboard session) — the sample appears on the open overlay within ~3 s, once.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npx eslint src/components/OverlayClient.tsx src/components/overlay` — Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "Alert overlay: AlertCard, tiers, test alerts, external feed"`

---

### Task 6: Goal and timer views

**Files:**
- Create: `src/components/overlay/GoalView.tsx`, `src/components/overlay/TimerView.tsx`
- Modify: `src/components/GoalOverlayClient.tsx`, `src/components/TimerOverlayClient.tsx`

**Interfaces:**
- Produces:
  - `export type GoalState = { enabled: boolean; title: string; goal: number; raised: number; pct: number }` and `export function GoalView(props: { goal: GoalState | null; color: string | null }): JSX.Element | null` — the current goal markup (renders nothing when disabled or goal ≤ 0).
  - `export type TimerState = { enabled: boolean; state: "running" | "paused" | "stopped"; remainingSeconds: number; maxSeconds: number }` and `export function TimerView(props: { timer: TimerState | null; color: string | null }): JSX.Element | null` — owns the 1 s local tick from the last received `remainingSeconds` (moved from `TimerOverlayClient`).
- `GoalOverlayClient` / `TimerOverlayClient` keep their props and polling (5 s / 4 s) and render the views; no visible change.

- [ ] **Step 1: Extract** both views; wrappers keep polling and pass state down.
- [ ] **Step 2: Verify in the browser**: old `/overlay/<u>/goal?key=` and `/timer?key=` render and update exactly as before (start/pause the timer from the current settings page).
- [ ] **Step 3: Run** `npx tsc --noEmit && npx eslint src/components/overlay src/components/GoalOverlayClient.tsx src/components/TimerOverlayClient.tsx` — Expected: clean.
- [ ] **Step 4: Commit** `git commit -m "Overlay: presentational goal and timer views"`

---

### Task 7: Combined state endpoint and the single-link page

**Files:**
- Create: `src/app/api/overlay/[username]/state/route.ts`, `src/app/overlay/[username]/live/page.tsx`, `src/components/overlay/LiveOverlay.tsx`

**Interfaces:**
- Consumes: `FeedTip`, `OverlayClient` `feed`/`positionClass` (Task 5); `GoalView`, `TimerView`, `GoalState`, `TimerState` (Task 6); `readTestAlert` (Task 4); `nextCursor` (Task 2); `anchorClasses`, `isAnchor`, `DEFAULT_POSITIONS` (Task 2).
- Produces API `GET /api/overlay/[username]/state?key=&after=` → `{ tips: FeedTip[]; test: TestAlert | null; cursor: string; goal: GoalState; timer: TimerState }`. Same key check and `overlayLastSeenAt` heartbeat as the alert feed (extract the shared tip query + heartbeat into `src/lib/overlay-feed.ts` and call it from both routes rather than copying). Goal/timer computations reuse `goalRaised`/`goalPercent` and the timer state derivation from the existing routes (extract to `src/lib/overlay-feed.ts` too).
- Produces page `/overlay/[username]/live?key=` — server component loads alert settings, tiers, library, colours and positions (falling back to `DEFAULT_POSITIONS` when a stored value fails `isAnchor`), renders `LiveOverlay`.
- `LiveOverlay`: one `setInterval(poll, 3000)`; a fixed 1920×1080 stage (`relative h-[1080px] w-[1920px] overflow-hidden`); goal and timer boxes positioned with `anchorClasses`; the alert layer last in the DOM with `z-50`, others `z-10`.

- [ ] **Step 1: Extract** `src/lib/overlay-feed.ts` from the alert/goal/timer routes and switch those three routes to it; run `npx tsc --noEmit` — Expected: clean; old routes return identical JSON (compare one response before/after locally).
- [ ] **Step 2: Implement** the state route, live page and `LiveOverlay`.
- [ ] **Step 3: Verify in the browser** with a throwaway creator: the live page shows goal bottom-centre and timer top-right; the network panel shows only `/state` requests, one every ~3 s; a confirmed local tip pops in the centre above the goal when the goal is moved to `center`; switching the goal off hides it within one poll.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npx eslint src/app/api/overlay src/app/overlay src/components/overlay src/lib/overlay-feed.ts` — Expected: clean.
- [ ] **Step 5: Commit** `git commit -m "Single OBS link: combined state endpoint and live overlay page"`

---

### Task 8: Split OverlaySettings into a data hook and section components (no visible change)

**Files:**
- Create: `src/components/features/useOverlayConfig.ts`, `src/components/features/AlertLookSection.tsx`, `src/components/features/AlertMediaSection.tsx`, `src/components/features/AlertTtsSection.tsx`, `src/components/features/AlertMoreSection.tsx`, `src/components/features/GoalSection.tsx`, `src/components/features/SubathonSection.tsx`, `src/components/features/AssetLibrary.tsx`, `src/components/features/ObsLinkCard.tsx`
- Modify: `src/components/OverlaySettings.tsx` (becomes a thin composition of the above, deleted in Task 10)

**Interfaces:**
- Produces: `export function useOverlayConfig(): { config: Config | null; error: string | null; reload(): Promise<void>; post(fd: FormData): Promise<Response> } & <the existing mutation functions, same names as today in OverlaySettings>` — move `Config`, the `/api/overlay/setup` load and every `/api/overlay/asset` caller out of the component unchanged. Each section component takes `{ cfg: ReturnType<typeof useOverlayConfig> }`.
- Section boundaries follow today's markup: alert card lines ~559–1082 split into look (theme, colour, style, big-tip threshold), media (sound/image/video + library random), TTS, more; goal ~1083–1251; timer ~1252–end; library and OBS URL/guide blocks into `AssetLibrary` / `ObsLinkCard`.

- [ ] **Step 1: Move** code into the hook and components, keeping JSX and handlers byte-for-byte where possible.
- [ ] **Step 2: Verify in the browser**: `/dashboard/overlay` looks and behaves as before (upload a sound, change colour, set a goal, start/stop timer, rotate key).
- [ ] **Step 3: Run** `npx tsc --noEmit && npx eslint src/components/features src/components/OverlaySettings.tsx` — Expected: clean.
- [ ] **Step 4: Commit** `git commit -m "OverlaySettings: split into data hook and section components"`

---

### Task 9: Dashboard menu, tips page, account page

**Files:**
- Create: `src/components/DashboardNav.tsx`, `src/components/TipList.tsx`, `src/app/[locale]/dashboard/tips/page.tsx`, `src/app/[locale]/dashboard/account/page.tsx`
- Modify: `src/app/[locale]/dashboard/layout.tsx`, `src/app/[locale]/dashboard/page.tsx`, `src/app/[locale]/dashboard/settings/page.tsx`, `src/components/SettingsForm.tsx`, `src/components/Icon.tsx` (only if a needed icon is missing), `messages/th.json`, `messages/en.json`

**Interfaces:**
- Produces `DashboardNav` (client; `usePathname` for the active item; groups and items exactly as the spec's menu table; admin item only when `admin` prop is true). Desktop: left sidebar (`w-56`, sticky). Below `md`: a horizontally scrollable tab row at the top with the same items (every item one tap away).
- Produces `TipList` (server component) — the tip query + `TipRow` list + its existing actions moved from `dashboard/page.tsx`; prop `limit?: number`.
- Routes: `/dashboard` shows stats, checklist, review invite and `TipList limit={5}` with a "ดูทั้งหมด" link to `/dashboard/tips`; `/dashboard/tips` shows `TipList` (current 100-row behaviour, `AutoRefresh` kept on both); `/dashboard/account` renders `ConnectedAccounts` and `AccountSecurity` (removed from `/dashboard/settings` and `SettingsForm`).
- Message keys (new namespace `dashNav`): `groupOverview`, `groupFan`, `groupStream`, `groupAccount`, `home`, `tips`, `donatePage`, `features`, `library`, `account`, `admin`, `seeAllTips`. Thai labels from the spec table: ภาพรวม · ฝั่งแฟน · บนจอสตรีม · บัญชี · หน้าหลัก · รายการทิป · หน้าโดเนท · ลูกเล่น · คลังเสียงและรูป · ตั้งค่าบัญชี.
- `/dashboard/features` and `/dashboard/library` links may 404 until Tasks 10/12 — fine within the branch.

- [ ] **Step 1: Implement** the components, routes and messages.
- [ ] **Step 2: Verify in the browser** at desktop and mobile (`resize_window` 375×812): each item highlights only on its own route; tips confirm/reject still work on both pages; account actions (connect Google, sign out everywhere) work on `/dashboard/account`.
- [ ] **Step 3: Run** `npm test && npx tsc --noEmit && npx eslint src/components src/app/[locale]/dashboard` and a th/en key-parity check (`node -e` comparing the key sets of both JSON files) — Expected: clean, no missing keys.
- [ ] **Step 4: Commit** `git commit -m "Dashboard: grouped menu, tips page, account page"`

---

### Task 10: The hub page and feature switches

**Files:**
- Create: `src/app/[locale]/dashboard/features/page.tsx`, `src/components/features/FeatureCard.tsx`, `src/components/features/FeatureHub.tsx`, `src/lib/feature-registry.ts`
- Modify: `src/app/api/overlay/asset/route.ts` (new kind `alertsToggle`), `src/app/api/overlay/setup/route.ts` (return `alertsEnabled`, positions, `featuresOnboardedAt`, `liveUrl`), `src/components/features/ObsLinkCard.tsx`, `src/app/[locale]/dashboard/overlay/page.tsx` (redirect to `/{locale}/dashboard/features`), delete `src/components/OverlaySettings.tsx`, messages

**Interfaces:**
- Produces `feature-registry.ts`: `export type FeatureId = "alerts" | "goal" | "subathon"`; `export const FEATURES: { id: FeatureId; icon: IconName; flag: keyof FeatureFlags; href: string; fanPage: boolean }[]` with icons `bell`, `target`, `clock` and hrefs `/dashboard/features/alerts|goal|subathon`. Future features add one entry here.
- `FeatureCard` props `{ feature; enabled: boolean; onToggle(next: boolean): void }` — icon, name, one-line description, switch, "ตั้งค่า →", optional orange "โผล่ในหน้าโดเนท" tag when `fanPage`.
- Hub sections in order: `ObsLinkCard` (single `liveUrl` with copy button + `OverlayConnectionStatus`; copy line "ใส่ใน OBS ครั้งเดียว ลูกเล่นที่เปิดจะขึ้นจอเอง"; browser-source size note "ขนาด 1920×1080"; for creators whose `overlayLastSeenAt` is set, a dismissible note that old links keep working **and that after adding the single link they should remove the old sources from OBS so alerts don't play twice**), "เปิดใช้อยู่", "แนะนำให้ลอง" (up to 3 disabled), "ลูกเล่นทั้งหมด" (folded; flat list — no category tabs with three features).
- Toggles: alerts → `alertsToggle`, goal → existing `goalToggle`, subathon → existing `timerToggle`; optimistic switch with rollback on error.

- [ ] **Step 1: Implement** registry, card, hub, API kind, setup fields, redirect; delete `OverlaySettings.tsx`.
- [ ] **Step 2: Verify in the browser**: switching goal off on the hub hides the goal on the open live overlay within a poll; `/dashboard/overlay` redirects; the old-links note mentions removing old sources.
- [ ] **Step 3: Run** `npm test && npx tsc --noEmit && npx eslint src` + key parity — Expected: clean.
- [ ] **Step 4: Commit** `git commit -m "Feature hub: cards with switches and the single OBS link card"`

---

### Task 11: Feature settings pages (pattern, positions, preview, test on OBS)

**Files:**
- Create: `src/components/features/FeatureSettingsLayout.tsx`, `src/components/features/SettingsSection.tsx`, `src/components/features/PositionPicker.tsx`, `src/components/features/AlertPreview.tsx`, `src/app/[locale]/dashboard/features/alerts/page.tsx`, `.../goal/page.tsx`, `.../subathon/page.tsx`
- Modify: `src/app/api/overlay/asset/route.ts` (new kind `position`: `{ feature: OnScreenFeature, anchor }` validated with `isAnchor`), messages

**Interfaces:**
- Consumes: section components (Task 8), `AlertCard` (Task 5), `sharedAnchors`/`ANCHORS` (Task 2), `POST /api/overlay/test` (Task 4).
- `FeatureSettingsLayout` props `{ title; backHref; enabled; onToggle; preview: ReactNode; children }` — back link "← ลูกเล่น", title, switch; two columns on `lg` (preview left, sections right), stacked on mobile.
- `SettingsSection` props `{ index: number; title: string; summary?: string; defaultOpen?: boolean; children }` — numbered collapsible (`<details>`), numbers ①–⑤ rendered from `index`.
- `PositionPicker` props `{ feature: OnScreenFeature; value: Anchor; positions; enabled; onChange(a: Anchor) }` — 3×3 grid; shows a warning line when `sharedAnchors` contains `feature`.
- Alerts page sections: ① หน้าตา (`AlertLookSection` + `PositionPicker`) ② เสียงและรูป (`AlertMediaSection`) ③ อ่านข้อความ (TTS) (`AlertTtsSection`) ④ แยกตามยอดเงิน (placeholder slot filled in Task 12) ⑤ ตั้งค่าเพิ่มเติม (`AlertMoreSection`). Goal page: `GoalSection` + `PositionPicker`. Subathon page: `SubathonSection` + `PositionPicker`.
- `AlertPreview`: renders `AlertCard` statically with the creator's settings; buttons "ลองยอด ฿20" / "ลองยอด ฿500" switch the preview amount (tier-resolved); primary button "ทดสอบบนจอ OBS" calls the test API and shows "ส่งแล้ว ดูที่ OBS" (or, when the overlay has not polled in the last 5 minutes, "ยังไม่เห็น OBS เชื่อมต่อ").

- [ ] **Step 1: Implement** the layout pieces, pages and `position` kind.
- [ ] **Step 2: Verify in the browser**: each page shows preview left / sections right; moving goal to `center` with alerts at `center` shows the warning; "ทดสอบบนจอ OBS" pops a sample on both the old alert link and the live link once each; preview amount buttons switch the card.
- [ ] **Step 3: Run** `npm test && npx tsc --noEmit && npx eslint src` + key parity — Expected: clean.
- [ ] **Step 4: Commit** `git commit -m "Feature settings pages: sections, positions, preview, test on OBS"`

---

### Task 12: Alert tiers UI, tiers API, library videos and library page

**Files:**
- Create: `src/app/api/overlay/tiers/route.ts`, `src/components/features/AlertTiersSection.tsx`, `src/app/[locale]/dashboard/library/page.tsx`
- Modify: `src/app/api/overlay/asset/route.ts` (library upload kind for `VIDEO` with the existing video type/size limits; library delete also clears tier fields equal to the deleted URL in the same transaction), `src/components/features/AssetLibrary.tsx` (videos section labelled for tier use), the alerts page (mount `AlertTiersSection` in ④), messages

**Interfaces:**
- Consumes: `normalizeTiers`, `MAX_TIERS`, `AlertTier` (Task 1).
- Produces `GET /api/overlay/tiers` → `{ tiers: AlertTier[] }`; `PUT /api/overlay/tiers` body `{ tiers: AlertTier[] }` → validates with `normalizeTiers`, rejects any URL that is not one of the creator's `AlertAsset` URLs (`400 invalid`), replaces all rows in one transaction, `revalidatePath("/overlay/[username]", "page")` like the asset route → `200 { tiers }`; `401` without session.
- `AlertTiersSection`: rows "฿min ขึ้นไป · sound · visual · time on screen", add up to 5 (button hidden at 5), edit opens inline pickers that choose from the library (sound list, sticker/video list) with "อัปโหลดเข้าคลัง" shortcut; time on screen 3–60 s; the existing big-tip threshold control stays in ① and is unaffected by tiers.

- [ ] **Step 1: Write a failing test** extending `src/lib/alert-tiers.test.ts`: `normalizeTiers` rejects `durationSec: 2` and `61` with `"invalid"` (if not already covered in Task 1).
- [ ] **Step 2: Implement** the API, section, library video upload, delete-clears-tiers, and the library page.
- [ ] **Step 3: Verify in the browser**: create tiers ฿100 and ฿500, the preview "ลองยอด ฿500" uses the ฿500 tier; delete the library sound used by the ฿500 tier → the tier row shows the normal sound and the overlay falls back without errors; a sixth tier cannot be added.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npx eslint src` + key parity — Expected: clean.
- [ ] **Step 5: Commit** `git commit -m "Alert tiers: settings section, API, library videos"`

---

### Task 13: First-visit popup

**Files:**
- Create: `src/components/features/FirstVisitPopup.tsx`
- Modify: `src/app/[locale]/dashboard/features/page.tsx`, `src/app/api/overlay/asset/route.ts` (new kinds `preset` with `{ preset: PresetId }` and `onboardSkip`), messages

**Interfaces:**
- Consumes: `PRESETS`, `presetChanges`, `PresetId` (Task 2); `liveUrl` and connection status (Task 10).
- `preset` kind applies `presetChanges(current, preset)` and sets `featuresOnboardedAt = now()`; `onboardSkip` only sets `featuresOnboardedAt`. Both idempotent.
- Popup shown when `featuresOnboardedAt` is null. Step 1 (only if `overlayLastSeenAt` is null): add the single link to OBS — link with copy button, 1920×1080 note, live connection status; "ไปต่อ" enabled any time (connection not required). Step 2: title "สตรีมของคุณเป็นแบบไหน", options พื้นฐาน · ตั้งเป้าหมาย · Subathon with one-line contents, "ข้าม ตั้งเอง", primary "ใช้ชุดนี้".

- [ ] **Step 1: Implement** the popup and API kinds.
- [ ] **Step 2: Verify in the browser** with a fresh local account: popup shows OBS step then presets; choosing Subathon switches on alerts/goal/timer without changing the goal amount set earlier; reload — popup gone. An account created before the migration (has `overlayKey`) never sees it.
- [ ] **Step 3: Run** `npm test && npx tsc --noEmit && npx eslint src` + key parity — Expected: clean.
- [ ] **Step 4: Commit** `git commit -m "Feature hub: one-time first-visit popup with presets"`

---

### Task 14: Guide copy, final verification

**Files:**
- Modify: `src/app/[locale]/start/page.tsx` and its messages (OBS steps describe the single link and the 1920×1080 browser source); any remaining links to `/dashboard/overlay` (grep) now point to `/dashboard/features`.

- [ ] **Step 1: Update** guide copy and links.
- [ ] **Step 2: Run** `npm test && npx tsc --noEmit && npm run lint && npm run build` — Expected: all succeed.
- [ ] **Step 3: Browser pass** (local DB, throwaway accounts) through the whole flow in light and dark mode and at 375 px: new account → popup → hub → alerts page → tier → test on OBS → live link shows it; an older account sees no popup and its old three links behave exactly as before.
- [ ] **Step 4: Commit** `git commit -m "Guide: single OBS link; feature hub final pass"`
- [ ] **Step 5: Report** to the founder: summary, the migration that needs their production go-ahead, and the "merge push" request. Do not push.
