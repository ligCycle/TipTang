# ขอคลิป/เพลง (media request) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (founder chose inline + an opus reviewer per task). Steps use checkbox (`- [ ]`) syntax.

**Goal:** fans attach a YouTube clip to a tip; the creator approves it (or uses auto-approve after a copyright warning) and it plays on stream from a queue through `/overlay/<u>/media`.

**Architecture:**
- Pure rules live in `src/lib/media.ts` (already has `parseYouTube`, `parseStart`, `cleanMediaTitle`, `overdue`).
- The server side is `src/lib/media-queue.ts`:
  - `MediaRequest` lifecycle hooked into the R5 pipeline;
  - queue promotion under `lockCreator`;
  - dashboard actions.
- The overlay plays with the YouTube IFrame API and reports only `started`, `ended` and `error`.

**Tech Stack:** Next 16 App Router, Prisma 7 (PrismaPg), next-intl, Tailwind 4, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-23-media-request-design.md`. The builder-check rulings B1–B16 at its end override the earlier sections.

## Global Constraints

- **Copy:**
  - th/en parity, no emoji in the UI, gender-neutral copy;
  - the creator's colour chain is `mediaColor` → `alertColor` → brand.
- **Schema:** goes into the unapplied `prisma/migrations/20261018000000_feature_hub/migration.sql`, with RLS enabled on the new table. After each change, run `db execute` on local 51230 and `prisma generate`.
- **Locks:**
  - lock order is Tip → Wheel → User;
  - media paths take only `lockCreator` (User);
  - transactions use `TIP_TX`.
- **Fan payments:**
  - the fan's tip is never blocked by the clip; problems become `mediaDropped`;
  - the amount is never raised for the fan.
- **Stored data:** only `videoId`, `title` and `startSec`. Never the fan's URL.
- **Naming:** the server module and helpers are `mediaQueue*`; "media" already means alert-set media.
- **Never:**
  - print overlay keys;
  - use the production DB;
  - push.

## Review Focus

1. Two OBS sources plus a dashboard skip at the same moment must leave exactly one `PLAYING` row, with no double-advance.
2. Reject → re-confirm of a clip that already started must not replay it (B7). Re-confirming a pending one must re-queue it once.
3. Auto-confirm failure must still queue the clip (B6), and auto-approve must not turn on without consent on the server (B14).
4. A refreshed or late OBS source must seek to the elapsed point, not restart (B10). A closed source must not jam the queue (safety net).
5. Extras order: with sound + wheel + clip, an amount below the floor drops the clip first on both client and server (B11).

---

### Task 1: Pure rules finish + oEmbed helper

**Files:**
- Modify: `src/lib/media.ts`, `src/lib/media.test.ts`
- Create: `src/lib/youtube.ts`, `src/lib/youtube.test.ts`

**Interfaces:**
- Produces:
  - `overdue(since: Date|null, maxSec: number, now: Date, slackSec = 60): boolean`
  - `mediaExtrasDrop(amount: number, min: number, prices: {sound: number|null, wheel: number|null, media: number|null}): Array<"media"|"wheel"|"sound">`: what to drop, in order (media, then wheel, then sound), until the rest fits `extrasFloor`.
  - `isVideoId(v: unknown): v is string`
  - `elapsedSec(since: Date|null, now: Date): number`
  - `TEST_VIDEO_ID` (constant)
  - `MEDIA_DEFAULTS = {minAmount: 50, maxSec: 180, volume: 70}`
  - `fetchOEmbed(videoId: string, fetchImpl = fetch): Promise<{ok: true, title: string} | {ok: false, reason: "gone"} | {ok: true, title: null}>`: 401/404 → gone; timeout/5xx/network → `{ok: true, title: null}`; 4 s timeout via AbortSignal; URL built only from the ID.

- [ ] Step 1: Tests.
  - `overdue` with the 60 s slack.
  - `mediaExtrasDrop` cases:
    - (amount 100, min 20, sound 30, wheel 40, media 50) → `["media"]`
    - (60, …) → `["media", "wheel"]`
    - (10, …) → all three
    - nothing selected → `[]`
  - `isVideoId`.
  - `fetchOEmbed` with a fake fetch: 200 JSON gives the cleaned title; 401 and 404 → gone; 500 → `title: null`; a throw → `title: null`; the called URL is exactly `https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D<id>`.
- [ ] Step 2: Run `node --test src/lib/media.test.ts src/lib/youtube.test.ts`. Expected: FAIL (missing exports).
- [ ] Step 3: Implement. `youtube.ts` is not server-only-marked, so it stays testable; it's imported only by server code.
- [ ] Step 4: Run again. Expected: PASS.
- [ ] Step 5: Commit "Media request: extras drop order, oEmbed check".

### Task 2: Schema, lifecycle and tip routes

**Files:**
- Modify: `prisma/schema.prisma`, `prisma/migrations/20261018000000_feature_hub/migration.sql`, `src/lib/tip-hooks.ts`, `src/app/api/tips/route.ts`, `src/lib/validators.ts` (if needed)
- Create: `src/lib/media-queue.ts`, `src/app/api/media/preview/route.ts`

**Interfaces:**
- **Schema:**
  - `MediaRequest {id, userId (FK User cascade), tipId String? @unique (FK Tip cascade), kind String @default("clip"), videoId, title, startSec Int @default(0), status MediaStatus @default(HELD), position Int @default(0), queuedAt?, promotedAt?, startedAt?, endedAt?, createdAt}`, with `@@index([userId, status, position])`.
  - `enum MediaStatus {HELD PENDING APPROVED PLAYING PLAYED SKIPPED REMOVED CANCELLED}`.
- **User fields:** `mediaEnabled false`, `mediaMinAmount 50`, `mediaMaxSec 180`, `mediaAutoApprove false`, `mediaAutoAckAt?`, `mediaVolume 70`, `mediaPaused false`, `mediaSeenAt?`, `mediaColor?`.
- **Lifecycle functions:**
  - `mediaQueueConfirmTx(tx, tipId, now)`: User already locked. HELD → PENDING/APPROVED. CANCELLED with `startedAt` → PLAYED. CANCELLED without `startedAt` → re-queued. Sets `queuedAt` and position = max + 1.
  - `mediaQueueRejectTx(tx, tipId)`: any of HELD/PENDING/APPROVED/PLAYING → CANCELLED, keeping `startedAt`.
- **`POST /api/tips`:**
  - Reads `mediaVideoId` and `mediaStart`, then checks them in order: `isVideoId`, the card is on, the floor via `extrasFloor` cumulative (B11), then `fetchOEmbed` in parallel with `verifySlip`.
  - On success: create the HELD row with the tip (nested create). Otherwise `mediaDropped: true`.
  - A request that carries `voice` (P7) and a clip together → 400 `media_both`. The check exists now: P7 fills it in.
  - The auto-confirm catch also retries `mediaQueueConfirmTx` under Tip → User locks. If that fails too → `mediaDropped`.
- **`GET /api/media/preview?u=&url=`:**
  - rate limit `media-preview:<ip>` 20/min;
  - creator must have the card on;
  - returns `{videoId, startSec, title, thumb: "https://i.ytimg.com/vi/<id>/mqdefault.jpg"}`, or 400 `bad_link`, or 422 `gone`.

- [ ] Step 1: Add the schema and migration SQL. Run `db execute` on 51230 and `prisma generate`. On a throwaway prisma dev, `migrate diff` must show an empty migration.
- [ ] Step 2: Implement the lifecycle and the pipeline hook (order: wheel → combo → wishlist → media).
- [ ] Step 3: Change the tip route and add the preview route.
- [ ] Step 4: Verify through the real routes on the local DB with a scripted tip and a test slip:
  - manual confirm → PENDING;
  - auto-approve on → APPROVED;
  - reject → CANCELLED, re-confirm → re-queued;
  - mark started, then reject + re-confirm → PLAYED;
  - card off → `mediaDropped`;
  - below floor → dropped;
  - bad ID → dropped.
- [ ] Step 5: `npx tsc --noEmit`, `npm test`. Commit.

### Task 3: Queue engine — overlay feed, actions, settings API, registry

**Files:**
- Create: `src/app/api/overlay/[username]/media/route.ts`, `src/app/api/media/route.ts`, `src/app/api/media/[id]/route.ts`
- Modify: `src/lib/media-queue.ts`, `src/lib/feature-registry.ts`, `src/lib/feature-presets.ts`, `src/app/api/overlay/asset/route.ts`, plus the hub flags readers.

**Interfaces:**
- **`mediaQueueCurrent(userId, now)`:** returns `{current: {id, videoId, title, startSec, fan, amount, elapsedSec} | null, volume, maxSec, paused, enabled, color}`.
  - Fast path: read the PLAYING row (if not overdue).
  - Slow path: in a transaction with `lockCreator`, re-read; finish an overdue row (PLAYED); promote the first APPROVED row by position (when enabled and not paused), setting `promotedAt`.
  - Card off: PLAYING → APPROVED at position = min − 1, with `promotedAt` and `startedAt` cleared.
- **`mediaQueueReport(userId, id, event: "started"|"ended"|"error", now)`:** under the lock, with conditional updates. `started` sets `startedAt` only once. `ended`/`error` change a row only while it is PLAYING.
- **`mediaQueueAction(userId, id, action: "approve"|"remove"|"skip"|"top")`:** owner-only, under the lock. Returns 404 for other users' rows.
- **`mediaQueueList(userId)`:** returns `{playing, pending, upNext, history (24 h, 20)}` with fan name, amount and title.
- **`mediaQueueTest(userId)`:** one test row at the top, replacing the old one.
- **Overlay route:** `GET` and `POST /api/overlay/<u>/media?key=`. GET calls `touchOverlaySeen`, plus `mediaSeenAt` at most every 30 s.
- **`PATCH /api/media`:** `{enabled?, minAmount? (1–100000), maxSec? (choices), autoApprove?, ack?, volume? (0–100), paused?, color?}`.
  - B14: refuses `autoApprove: true` without consent. `ack: true` sets `mediaAutoAckAt`.
  - `GET /api/media` returns the settings and the queue.
- **Registry:**
  - entry `{id: "media", icon: "music" (add to Icon if missing), flag: "mediaEnabled", href: "/dashboard/features/media", fanPage: true, toggleKind: "mediaToggle", obsPath: "/media", obsSize: "640×480"}`;
  - extend the unions and `FeatureFlags`;
  - add the `mediaToggle` branch to `/api/overlay/asset`.

- [ ] Step 1: Implement. For the concurrency check, fire 3 overlay GETs plus 1 skip together via `Promise.all` through the routes (PGlite serialises connections, so this checks logic, not locks), then assert there is exactly one PLAYING row and the order is right.
- [ ] Step 2: Check consent is refused (403 `ack_required`), other users' rows → 404, and the bad-key overlay → 403.
- [ ] Step 3: tsc, tests. Commit.

### Task 4: Overlay page + player, CSP

**Files:**
- Create: `src/app/overlay/[username]/media/page.tsx`, `src/components/overlay/MediaOverlayClient.tsx`
- Modify: `next.config.ts`

**Interfaces:**
- **Page:** key check like the wheel overlay page.
- **Client:**
  - Loads `https://www.youtube.com/iframe_api` once and polls every 3 s.
  - Creates the player with `host: "https://www.youtube-nocookie.com"`, `playerVars {autoplay: 1, controls: 0, start: startSec + elapsedSec, end: startSec + maxSec, origin: location.origin, rel: 0, playsinline: 1}` and `setVolume(volume)`.
  - Reports:
    - first PLAYING → POST `started`;
    - ENDED → `ended`;
    - errors 100/101/150 → `error`;
    - errors 2/5/153 → reload the player once, then give up silently;
    - 20 s watchdog with no PLAYING → `error`;
    - unstarted 2 s after load in a normal tab → a "คลิกเพื่อเปิดเสียง" button.
  - When `current.id` changes or becomes null, it destroys/replaces the player.
  - Layout: a 16:9 player (640×360) with a card underneath, "ขอโดย <fan> · ฿<amount>" plus the title, in the creator's colour on the dark card style used by the other overlays. Nothing is drawn over the player.
- **CSP:**
  - `OVERLAY_HEADERS` gets script-src +`https://www.youtube.com` and frame-src +`https://www.youtube-nocookie.com https://www.youtube.com`;
  - the base policy gets img-src +`https://i.ytimg.com`.

- [ ] Step 1: Implement.
- [ ] Step 2: Browser check in an iframe (key not printed):
  - a test row plays;
  - an `ended` post moves to the next row;
  - a dashboard skip switches the video within 3 s;
  - refreshing mid-clip seeks to the elapsed point;
  - the console shows no CSP report for YouTube hosts.
- [ ] Step 3: Commit.

### Task 5: Settings page + hub card

**Files:**
- Create: `src/app/[locale]/dashboard/features/media/page.tsx`, `src/components/features/MediaPage.tsx`
- Modify: `messages/th.json`, `messages/en.json` (`mediaPage.*`, `featureHub.f_media`/`d_media`)

**Interfaces:**
- The page uses `FeatureSettingsLayout`, the autosave queue pattern (from GoalPage), `ObsLinkCard`, and test-on-OBS through `mediaQueueTest`.
- Sections:
  - ① Queue, polled every 5 s: now playing + skip; waiting approval with approve/remove; up next with top/remove; history.
  - ② Settings: on/off, minimum, max length chips, auto-approve with a warning dialog (tick "เข้าใจแล้ว", then send `ack`), volume slider, pause switch.
  - ③ OBS link 640×480, colour, test button, and a "เชื่อมต่อแล้ว" badge when seen within 60 s.
- Warning copy (th): clips play without review; the creator is responsible for copyright and content; platforms may mute, remove or strike streams with copyrighted music; you can still skip anything.

- [ ] Step 1: Implement.
- [ ] Step 2: Browser check at 402 px and desktop, light and dark: the dialog blocks until ticked; actions work; parity script OK.
- [ ] Step 3: Commit.

### Task 6: Donate page block, tip badge, terms

**Files:**
- Create: `src/components/MediaPicker.tsx`
- Modify: `src/components/TipForm.tsx`, `src/app/[locale]/[username]/page.tsx`, `src/components/TipList.tsx`, `src/components/TipRow.tsx`, messages (`profile.media*`, `dashboard.mediaBadge`, terms `randomTitle`/`randomBody`)

**Interfaces:**
- **Donate page:** passes `mediaChoice: {minAmount, maxSec} | null` when the card is on and `canTip`, from the creator select (no extra query).
- **MediaPicker:**
  - a "สื่อจากแฟน" block with the "ขอคลิป/เพลง" option;
  - the link input calls preview on blur or paste and shows the thumbnail, title and fine print;
  - locked while the amount is below the floor.
- **TipForm:**
  - `checkPick` uses `mediaExtrasDrop` (media first);
  - FormData gets `mediaVideoId` + `mediaStart`;
  - shows a `mediaDropped` note after sending;
  - reset clears the clip.
- **Badges:** the tip row badge "ขอคลิป: <title>"; the alert feed is unchanged.
- **Terms:** extend the random-features section (title becomes "ลูกเล่นจากแฟน ..."): copyright of requested clips is the creator's and the requester's responsibility, and the creator may skip any request. Don't touch `lastUpdated` (set at deploy).

- [ ] Step 1: Implement.
- [ ] Step 2: Browser check at 375 px:
  - paste each link kind, plus a bad link and a gone video;
  - the floor locks the option;
  - lowering the amount drops the clip first, with the note;
  - submit through a tip and see it in the queue.
- [ ] Step 3: Commit.

### Task 7: Final pass

- [ ] `npm test`, `npx tsc --noEmit`, `npm run build` (dev server stopped), lint (baseline only), parity.
- [ ] Fresh prisma dev: `migrate deploy` plus an empty diff.
- [ ] Full flow: tip with a clip → confirm → approve → plays → ends → next; auto-approve path; reject mid-play.
- [ ] Opus whole-project review and one fix pass. Copy rulings and minors to the memory rulings log, then delete the workspace.
