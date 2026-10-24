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
