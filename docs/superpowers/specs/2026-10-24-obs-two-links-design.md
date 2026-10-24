# Two OBS links + one OBS bar on every page — design

Project 11 on `feature-hub`, decided by the founder on 2026-10-24 after seeing P5–P10.

## Problem

Setting up OBS is confusing:
- There are up to 10 per-feature links: alerts, goal, timer, wheel, combo, media, gacha, PK, boss, to-do.
- Each settings page puts the link somewhere different:
  - Alerts has a big URL section at the top.
  - Goal has a small copy chip in section ④.
  - Combo, media, gacha and boss have it in their last section.
  - PK's sections aren't numbered.
- The status badge comes in two different styles.

## Founder decisions

1. **Two links.**
   - **Main link:** every popup, played one at a time.
   - **Bars link:** every bar that stays on screen.
   - Per-feature links keep working, listed under "ขั้นสูง: แยกวางเอง".
   - The to-do link stays separate.
2. **One OBS bar under every page title.** The links are pasted from one place: the hub's "เชื่อม OBS" card.

**Not this:** the old 1920×1080 stage with 3×3 positions. It was dropped on 2026-10-19 because it forced creators to fit their scene to TipTang. Both new links adapt to whatever source size the creator chose.

## Which feature shows where

Stored in `src/lib/feature-registry.ts` as a new field: `stage: ("main" | "bars")[]`.

| Feature | Main link (popups) | Bars link |
|---|---|---|
| alerts, soundpick | ✓ (the alert card) | |
| media, voice | ✓ | |
| wheel | ✓ (spin) | |
| gacha | ✓ (reveal) | |
| boss | ✓ (kill banner) | ✓ (HP card) |
| goal, subathon (timer), combo, pk | | ✓ |

## Main link: `/overlay/<u>` (same URL, nothing to re-paste)

- **Stage:** `src/components/overlay/Stage.tsx` gives one turn at a time.
  - Short popups wait in first-in-first-out order: alert, wheel spin, gacha reveal, boss kill.
  - *S1:* media (clip/voice) starts only when the stage is free.
    - If a popup arrives while media plays, the media pauses and hides.
    - The popup shows, then the media resumes from where it was.
    - So alert sound and TTS never play over a clip.
  - With no provider (a client on its own link), the stage is always free, so the per-feature links behave exactly as today.
- **Mounting** (*S2*):
  - The page polls `GET /api/overlay/<u>/stage?key=…&link=main` every 20 s.
    - The poll is key-checked.
    - It returns which cards are on and touches `User.mainSeenAt` (throttled to 30 s).
  - Clients are mounted only for cards that are on. The alert client is always mounted.
  - A card switched on while OBS is open appears within 20 s, with no reload.
- **Fit** (*S3*):
  - Non-alert popups render inside a `FitBox`: centred, and scaled down (never up) to fit the source window.
  - Natural sizes: wheel 600×600, gacha 500×500, media 640×480, boss banner 600×240.
  - Alerts keep their current top-centre placement.
  - Result: a creator's existing 800×300 alert source still shows a wheel, just smaller.
- **Media key** (*S4*):
  - The YouTube player sends the page URL to YouTube, so the `?key=` must be stripped first.
  - Today the strip happens on load. Move it to just before the player is created, and only when a clip is about to play.
  - A browser refresh of the main link then keeps working until a clip has played.
- **Test:** `?test=1` (the alerts preview) is unchanged.

## Bars link: `/overlay/<u>/bars` (new)

- **Content:** the bars of cards that are on, stacked top to bottom in a fixed order: goal, timer, combo, PK, boss HP.
- **Hiding:**
  - Combo shows only while a combo is running or summarising; otherwise it's hidden.
  - PK shows only when a match is shown; otherwise it's hidden.
  - Boss is hidden when the list is empty.
  - Goal and timer follow their own cards.
- **Polling:** the same stage poll with `link=bars` touches `User.barsSeenAt`.
- **Boss kills** (*S5*): the boss client in bars mode asks the feed with `claim=auto`.
  - The server claims kills there only when the main link isn't live (`mainSeenAt` older than `LIVE_MS`).
  - A creator who placed only the bars link still sees kill banners, inline as today.
  - With the main link live, banners play there instead.
- **Combo** (*S6*): the level-up celebration stays inside the combo bar. It's an animation of the bar itself, not a popup.
- **Live-only (combo, boss):** unchanged. Their clients poll their own feeds wherever they're mounted, which keeps `comboOverlaySeenAt` and `bossSeenAt` fresh.

## Server

- **Schema:** `User.mainSeenAt` and `User.barsSeenAt` (`DateTime?`), added to the feature_hub migration.
- **`GET /api/overlay/[username]/stage`** (key-checked):
  - Returns `{ cards: { alerts, media, voice, wheel, gacha, boss, goal, timer, combo, pk } }`, all booleans.
  - Touches the right `*SeenAt`.
- **Boss feed:** takes `claim=auto|0|1`. The default `1` keeps today's behaviour for the per-feature link.
- **`POST /api/overlay/setup`:** also returns `mainSeenAt`, `barsSeenAt` and the own-link seen times (combo, media, boss) for the OBS bar.

## Dashboard

- **Hub card "เชื่อม OBS"** (`id="obs"`, top of `/dashboard/features`, always shown):
  - **Rows for the main and bars links:** name, what's on it now (names of the enabled cards), copy button, size hint, connection badge.
    - Size hints: main "แนะนำ 800×450 ปรับได้"; bars "แนะนำ 700×600 ปรับได้".
  - **Optional row:** "ลิงก์ภารกิจค้างทำ (ไม่บังคับ)".
  - **Moved here from the alerts page:**
    - the step-by-step OBS guide;
    - "other programs / phone";
    - "สร้างลิงก์ใหม่" (key rotation, which closes the known gap that rotation lived only on the alerts page).
  - **`<details>` "ขั้นสูง: แยกวางเอง":** every per-feature link with its size.
- **FeatureCard:** the per-card copy button is replaced by a chip, "แสดงบน: ลิงก์หลัก" / "ลิงก์แถบ" / both.
- **`ObsBar`** (`src/components/features/ObsBar.tsx`):
  - Placement: right under the title on every feature page, passed through `FeatureSettingsLayout`'s new `obs` prop.
  - Content: "แสดงบน: <link name(s)> · ● เชื่อมต่อแล้ว / ยังไม่ได้วางลิงก์ — วิธีวางลิงก์ →(hub#obs) · [ทดสอบบนจอ]".
  - *S7:* "connected" means the feature's stage link(s) were seen within 2 min, or the feature's own link was (combo, media, boss track their own).
  - It re-checks every 15 s while not connected.
  - The test button calls the page's existing test.
- **Pages:**
  - The per-page OBS link copy rows and to-do link rows are removed.
  - The per-page live badges (combo, media, boss) are replaced by the ObsBar.
  - Colour pickers stay in each page's own settings sections.
  - The alerts page's section ① (URL, guide, rotate) is gone, and the sections are renumbered.
  - PK gets numbered sections.
  - Every page then reads: title + switch → ObsBar → ①②③.
- **Copy:** th/en parity, no emoji, gender-neutral. Check the คู่มือ (guide) page and the "ใช้โปรแกรมอื่น" text for wording that assumes one link per feature.

## Out of scope

A single combined feed for the main link: it mounts up to 5 polling clients. Noted as a later optimisation.

## Builder-check rulings (opus, 2026-10-24). These override the sections above.

- **C1. Media pause keeps server timing honest.**
  - Server:
    - `MediaRequest` gets `pausedMs` (`Int`, default 0) and `pausedAt` (`DateTime?`).
    - The client reports `paused`/`resumed`.
    - `overdue` and `elapsedSec` subtract the paused time.
    - The feed takes `hold=1` (the stage is busy), and then never promotes a new request.
  - Client:
    - The watchdog and the voice timer are suspended while paused.
    - `pauseVideo` is added; the voice bar uses `animation-play-state`.
    - Media is hidden with `visibility` and never unmounted.
- **C2. Embedding.**
  - The clients get an `embedded` prop (fill the box, `display:none` when idle).
  - Boss gets `mode: "card" | "banners" | "both"` (own link = both).
  - `useStage()` returns `{ free, acquire(kind), release() }`. With no provider, the stage is always free.
  - Alerts and their Confetti stay outside FitBox.
- **C3. Claim only when the stage is free.**
  - Wheel and gacha fetch (which is the claim) only when idle and the stage is free.
  - Boss banners mode polls `claim=0` unless the stage is free and no banner is showing.
  - With `claim=0`, the boss test feed's kill/chain are stripped too.
- **C4. The own link wins (no double play).**
  - New `User.wheelSeenAt`, `gachaSeenAt` and `bossLinkSeenAt`, touched only by the per-feature link.
  - Main-link clients send `via=main`. They don't touch those fields or `mediaSeenAt`; `bossSeenAt` is still touched (live-only damage).
  - When the feature's own link was seen within `LIVE_MS`, its feed returns idle to `via=main`, and the stage leaves the card out.
- **C5. `?test=1` on the main link:** alerts only, no stage poll, nothing claimed.
- **C6. Key strip (YouTube `forigin`).**
  - The key is stripped just before `new YT.Player` and restored with `replaceState` on `onReady`.
  - Verify the iframe `src` carries no key.
- **C7. Alert turn length.** An alert releases the stage at the later of `durationSec` and TTS end (or error), capped at 30 s.
- **C8. Order.**
  - In the stage queue, alerts come before other popups.
  - A non-alert popup waits 3.5 s after it is claimed before taking its turn, so the tip's own alert shows first.
- **C9. Bars layout.**
  - PK becomes `w-full max-w-[800px]`.
  - The bars column is scaled to fit (FitBox by width and height).
  - Size hint is 800×600.
- **C10. Tests and cards that are off.**
  - The bars page mounts every bar client (they hide themselves).
  - On the main page, the stage poll runs every 5 s, and counts a card as on when a test is pending.
- **C11. ObsBar polling.** `GET /api/overlay/status` is extended with the seen times; nothing is fetched from setup in a loop.
- **C12. Copy and leftovers.**
  - Update `obsRotateConfirm` (every link), `obsGuideStep4` (size) and the guide page lines that say one link per feature.
  - Remove the goal and timer copy rows (keep the preview iframes).
  - Delete `view="all"` and the `obsBlock` once they're unused.
  - Soundpick and voice have no page of their own, so no ObsBar for them.
- **C13. CSP: no change needed.**
  - `/overlay/:path*` already gets the overlay CSP with YouTube.
- **C14. Load.**
  - On the main link, the boss client polls every 4 s.
  - A combined feed stays a later optimisation.
