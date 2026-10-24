# Two OBS links (main + bars) + one OBS bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Creators paste 2 OBS links instead of up to 10.
- The main link (the existing alerts URL) plays every popup one at a time.
- The bars link stacks the bars that stay on screen.
- Every feature page shows the same OBS bar under its title.

**Spec:** `docs/superpowers/specs/2026-10-24-obs-two-links-design.md`. Rulings C1–C14 override S1–S7.

## Global Constraints
- **Copy:** th/en parity, no emoji, gender-neutral.
- **Schema:** goes into the feature_hub migration.
- **Never:** print overlay keys, use the production DB, or push.
- **Per-feature links:** keep working exactly as today when the main link isn't involved.
- **Main link URL:** `/overlay/<u>?key=` must not change. Existing alert sources must keep working.

## Review Focus
1. No double play. With an old `/wheel`, `/media` or `/boss` source still open next to the main link, every spin, pull, kill and clip plays exactly once (C4).
2. A popup during a clip or voice pauses it. The clip resumes, the server doesn't end it early, and a paid voice is never burnt by a burst of alerts (C1).
3. Nothing claimed is lost. Nothing is claimed while the stage is busy, and nothing is claimed from a `?test=1` preview tab (C3, C5).
4. The YouTube player never receives the key, and an OBS refresh of the main link still shows alerts (C6).
5. Every feature page reads the same way: title + switch → ObsBar → ①②③. The hub "เชื่อม OBS" card has both links, the guide, the rotate button and the advanced list.

---

### Task 1: Server (schema, stage route, own-link-wins, boss claim modes, media pause, status)

**Files:**
- Schema: `prisma/schema.prisma` and the migration.
- Libs: `src/lib/media.ts`, `src/lib/media-queue.ts`, `src/lib/boss-server.ts`, `src/lib/wheel-server.ts`, `src/lib/gacha-server.ts`, `src/lib/feature-registry.ts`, and a new `src/lib/obs-stage.ts` (pure).
- Routes: `src/app/api/overlay/[username]/{stage,wheel,gacha,media,boss}/route.ts`, `src/app/api/overlay/status/route.ts`.
- Tests: `src/lib/obs-stage.test.ts`, `src/lib/media.test.ts`.

**Produces:**
- `ownLinkLive(seenAt: Date | null, now: Date): boolean` (`LIVE_MS`).
- `stageCards(flags, ownLive, tests, link: "main" | "bars")`, which returns `Record<StageCard, boolean>`.
- `overdue(since, maxSec, now, slackSec?, pausedMs?)` and `elapsedSec(since, now, pausedMs?)`, which subtract the paused time.
- `FeatureDef.stage: ("main" | "bars")[]`.
- `GET /api/overlay/[u]/stage?key&link=main|bars` returns `{ cards }` and touches `mainSeenAt` or `barsSeenAt` (throttled to 30 s).
- Feeds take `via=main`. When the feature's own link is live they return idle, and they don't touch the own-link seen fields.
- The boss feed takes `claim=0|1|auto`. Test kills and chains are stripped when it doesn't claim.
- The media feed takes `hold=1`, and the report takes `paused` / `resumed`.
- `GET /api/overlay/status` adds `mainSeenAt`, `barsSeenAt`, `comboSeenAt`, `mediaSeenAt` and `bossLinkSeenAt`.

- [ ] Write failing tests:
  - paused time is subtracted in `overdue` and `elapsedSec`;
  - `stageCards`: own-link-live excludes a card from main; a pending test counts as on; bars lists goal/timer/combo/pk/boss.
- [ ] Implement the schema and SQL. Run migrate on a fresh DB and check the diff is empty. Apply locally and `generate`.
- [ ] Implement the libs and routes.
- [ ] Check through the routes:
  - stage main/bars;
  - with `wheelSeenAt` live, `via=main` gets idle;
  - boss `claim=0` claims nothing;
  - media `paused`/`resumed` stores `pausedMs`;
  - status returns the seen times.
- [ ] Commit.

### Task 2: Overlay (stage, FitBox, main page, bars page)

**Files:**
- New: `src/components/overlay/Stage.tsx` (`StageProvider`, `useStage`, `FitBox`), `src/components/overlay/MainStage.tsx`, `src/app/overlay/[username]/bars/page.tsx`, `src/components/overlay/BarsStage.tsx`.
- Modified: `src/app/overlay/[username]/page.tsx`, the `OverlayClient.tsx` turn, the Media/Wheel/Gacha/Boss/Pk clients (embedded/mode/via), and the Goal/Timer/Combo clients if needed.

- [ ] Stage:
  - one turn at a time;
  - alerts before others;
  - non-alerts wait 3.5 s after a claim;
  - media pauses for any popup and resumes after.
- [ ] Main page:
  - without `test`: wrap alerts in the stage and mount popup clients by stage cards, polled every 5 s;
  - with `test=1`: alerts only.
- [ ] Bars page: every bar client mounted, stacked, scaled to fit.
- [ ] Check in the browser pane:
  - an alert + wheel spin + gacha + boss kill play one after another on the main link;
  - a clip pauses for an alert and resumes;
  - the key is absent from the YouTube iframe `src`;
  - the bars link shows goal/combo/PK/boss;
  - an old `/wheel` source open → main doesn't play spins.
- [ ] Commit.

### Task 3: Dashboard (hub OBS card, ObsBar, page cleanup, copy)

**Files:**
- New: `src/components/features/ObsBar.tsx`, `src/components/features/ObsSetupCard.tsx`.
- Modified: `FeatureHub.tsx`, `FeatureCard.tsx`, `FeaturePages.tsx` (`obs` prop), `OverlaySettings.tsx`, the Goal/Wheel/Combo/Media/Gacha/Pk/Boss pages, and messages.

- [ ] Hub card with:
  - main + bars + to-do links;
  - status;
  - guide + other programs;
  - rotate;
  - an advanced list.
- [ ] ObsBar on every feature page; remove the old link rows and badges; renumber the sections.
- [ ] Copy fixes (C12).
- [ ] Check every page at 402 px, plus the hub card and the rotate button.
- [ ] Commit.

### Task 4: Final pass
- [ ] Run tests, tsc, build, lint, parity and the migration diff.
- [ ] Opus whole-project review and one fix pass. Write the rulings log. Delete the workspace.
