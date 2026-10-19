# Fan sound pick ("แฟนเลือกเสียง") + sound sets ("ชุด") — design

**Date:** 2026-10-19 · **Status:** approved by the founder 2026-10-19
**Project 2 of the donation-features roadmap.** Built on branch `feature-hub` (project 1, not yet
merged or deployed; its two migrations are not applied in production yet). **The founder decided
projects 1 and 2 ship together in one deploy.**

## Why

The founder's picture: what a fan wants to hear with their tip depends on the stream. On a horror
game stream a fan wants to make the creator jump; on a calm chatting stream they may pick
something light, or nothing. The creator knows the mood, so the creator decides which sounds are
on offer today, and the fan picks one of those when tipping.

The founder proposed organising the library into **sets** ("ชุด"), e.g. "เกมผี" or "คุยเล่น",
and switching the whole stream's mood by switching the set. They decided:

- The active set also drives **normal alerts** (tips where the fan picked nothing): their sound
  and image are picked at random from the active set, "so the whole stream has one mood".
- The creator sets a **minimum tip per sound** ("ราคาขั้นต่ำของแต่ละเสียง"), and it applies
  everywhere: a sound priced ฿100 only ever plays on tips of ฿100 or more, whether the fan
  picked it or it came up at random (founder chose this over "price only matters when picking").
- Mockups of the donate page, the library with set tabs, the quick set switcher and the two-step
  "create set" window were approved as shown ("ไม่งง โอเคทำตามนี้เลย"). The mockups live in
  `.superpowers/brainstorm/563-1792387958/content/` (`sound-pick-v2.html`, `create-set-v1.html`).

Standing founder rules that apply: creators must not get confused during setup; adapt to the
creator rather than make them adapt; no emoji in the UI (line icons from `Icon.tsx`);
gender-neutral copy; Thai and English messages kept in parity; settings save by themselves where
it is safe.

## Goals

- A creator can make a set in under a minute and switch today's set with one tap before going
  live.
- A fan sees today's sounds on the donate page, can preview each one, and knows the minimum tip
  for each before paying.
- The sound a fan picked (and paid for) is the sound that plays on stream.
- Creators who never touch sets see no change: after deploy their alerts look and sound exactly
  as before.

## Non-goals

- Fans picking images, GIFs or videos (sounds only; images in a set are random with the card).
- Fans uploading their own sounds, text-to-speech voice choices, or anything paid outside a tip.
- Per-set amount tiers. Tiers (project 1) stay global and pick from the whole library.
- Scheduling sets by time or by game.

## Anti-goals (failure even if it "works")

- A fan pays the minimum for a sound and a different sound plays.
- A creator switches to a calm set but a scary sound still blasts from the old set (except the
  one case below: a sound a fan already paid for).
- A creator has to understand "inRandom", "pools" or any other internal idea. The only words they
  meet are: ชุด, ชุดที่ใช้อยู่, แฟนเลือกได้, ราคาขั้นต่ำ.
- The donate page gets noticeably heavier or slower when the feature is off.

## Concepts

- **Library** (exists, project 1): every sound / image / video a creator uploaded
  (`AlertAsset`). Unchanged as the place files live.
- **Set** ("ชุด"): a named group of library files. A file can be in several sets.
- **Active set** ("ชุดที่ใช้อยู่"): exactly one set per creator at any time. It drives:
  1. normal alerts' random sound and random visual (image, GIF or video), and
  2. the sounds fans may pick on the donate page.
- **Per item in a set:** for sounds, "แฟนเลือกได้" (fan-pickable, on by default) and
  "ราคาขั้นต่ำ" (minimum tip in whole baht, default free = no extra minimum beyond the creator's
  general minimum tip). The same file can have a different price in a different set. The price
  holds for random plays too (see below), so it means "this sound needs at least ฿X".

Sets **replace** the project-1 switch "ใช้ในแจ้งเตือนปกติ" (`AlertAsset.inRandom`): "on in normal
alerts" now means "in the active set". The switch disappears from the library cards.

## What happens when a tip plays

Order of precedence for each alert:

| Part | 1st | 2nd | 3rd |
|---|---|---|---|
| Sound | the sound the fan picked | the amount tier's sound | random from the active set's sounds whose minimum ≤ the tip amount |
| Visual (image / video) | the amount tier's visual | random from the active set | none |
| Time on screen, big celebration | the amount tier | default | — |

Builder's note on the one clash: if the fan picked a sound and the visual that comes out is a
video, the video plays **muted** and the fan's sound plays (decided by Claude: the fan paid for the
sound; dropping the creator's video would surprise the creator more).

A picked sound plays even if the creator has switched sets since the tip was sent (the fan paid
for it), as long as the file still exists in the library. If the file was deleted, the alert
falls back to rows 2–3.

If no sound in the active set qualifies for the tip amount (all are priced higher), the alert
plays with no sound (Claude's call; the library tells the creator when a set has no free sound).
Images, GIFs and videos have no price; they are always in the random visual draw.

Test alerts from the dashboard ("ทดสอบบนจอ OBS") behave like a tip with no pick, at the test
amount.

## Donate page (fan side)

- A section "เลือกเสียงตอนทิปขึ้นจอ (ไม่บังคับ)" under the amount buttons, with a small tag
  showing today's set name. Shown only when the feature is switched on, alerts are on, and the
  active set has at least one fan-pickable sound.
- Each sound: a play/preview button, its name, and its minimum ("ฟรี" or "฿50").
- Sounds whose minimum is above the currently entered amount are disabled and **cannot be
  picked**; they show "ทิป ฿X ขึ้นไป". TipTang never raises the fan's amount by itself (founder:
  adding money on the fan's behalf could cause problems). If the fan lowers the amount below the
  picked sound's minimum, the pick is cleared and a short note says why.
- Picking is optional; the hint says no pick = random from today's set. Tapping the selected
  sound again unselects it.
- A line under the picker says sounds play on screen while the creator is live (Claude's call:
  the picker is not hidden when offline, because the "is live" signal only updates every 5
  minutes and would hide it early in a stream; the line sets the right expectation instead).
- The fan's choice is sent with the tip. The server checks it (below); the slip/amount checks that
  exist today are unchanged.

Sound names: the creator names sounds (see library). Until named, a sound shows "เสียง 1, 2…" as
today.

## Server rules for a pick (tip creation, `POST /api/tips`)

- The picked file must belong to the creator, be a sound, be in the creator's **active** set,
  be fan-pickable there, and the tip amount must be ≥ its minimum and ≥ the creator's general
  minimum tip.
- If the pick fails only because the set changed between page load and submit (file no longer in
  the active set / no longer pickable / price raised), **the tip still goes through without a
  pick**, and the thank-you screen tells the fan the sound wasn't available so a random one will
  play (Claude's call: the fan has already transferred money; rejecting the tip is worse).
  Anything else malformed (not the creator's file, not a sound) is ignored the same way.
- The tip stores which file was picked. The amount the fan entered is what's compared, same as the
  amount used for timers and goals today; a slip that shows a lower amount is already flagged
  "ยอดไม่ตรง" for the creator to decide.

## Creator side

### Hub card

A new feature card "แฟนเลือกเสียง" on `/dashboard/features`, with the orange "fan page" tag the
registry already supports (`fanPage: true`), an on/off switch (shows/hides the picker on the
donate page), and "ตั้งค่า" linking to the library page. Off by default for everyone (Claude's
call: the donate page doesn't change until a creator opts in). It has no OBS link of its own (the
sounds play through the existing alerts link).

### Quick set switcher

A one-line bar "ชุดเสียงไลฟ์วันนี้ [ชื่อชุด ▾]" on the hub page and on the dashboard home, as in
the mockup. Changing it saves immediately.

### Library page (`/dashboard/library`)

- Set tabs at the top; the active set has a "ใช้อยู่" badge; a "+ สร้างชุด" tab opens the
  create-set window. An "ทั้งหมด" view (all files) stays available for uploading and deleting
  files, as today.
- Inside a set: one row per file. Sounds have the fan-pickable switch and a price box; images,
  GIFs and videos just show they're in the set. Rows can be removed from the set (the file stays
  in the library). "+ เพิ่มไฟล์เข้าชุดนี้" picks from the library or uploads.
- Set actions: rename, "ใช้ชุดนี้" (make active), delete. The active set can't be deleted, and
  neither can the last remaining set.
- Sound names: each sound gets an editable name (the donate page shows it). Default is the
  original file name without extension if available, otherwise "เสียง N".
- Everything on this page saves by itself (switches immediately, price/name a moment after typing
  stops), matching the rest of the dashboard.

### Create-set window (two steps, as in the approved mockup)

1. Name; "start from": empty or a copy of an existing set; tick files from the library (filter:
   all / sounds / images / videos); upload new files right there (they go into the library).
2. For each sound: fan-pickable switch (on) and minimum (free). Then "ใช้เลยตอนนี้" or
   "เก็บไว้ก่อน", and create.

### Alerts page, section ③

Today it summarises the files "on in normal alerts". It now shows the active set's name and
contents and the same set switcher, plus a link to the library.

## Data and migration

- New: sets (per creator, name, created time), set items (set, file, fan-pickable, minimum),
  the creator's active set, a name per library file, the picked file on a tip, and the hub
  switch for the feature. Exact table/column shapes are left to the builder.
- Projects 1 and 2 ship in one deploy, and project 1's migrations are not applied anywhere but
  local dev. Fold this project's schema into them (edit them) rather than stacking a third
  migration; creators never see the project-1 "ใช้ในแจ้งเตือนปกติ" switch.
- **Every creator gets a set "ชุดหลัก" (en: "Main set") made active**, containing exactly the
  files that would be "on in normal alerts" after project 1's media migration. So live alerts
  are unchanged. Creators with no library files get an empty "ชุดหลัก".
- New uploads from the library page join the active set; uploads from a tier row don't join any
  set (they're for that tier). Videos uploaded in the library are added to the active set only if
  the creator ticks them in (Claude's call, matching project 1 where videos start off).
- `AlertAsset.inRandom` is removed (never reaches production); the media migration's "would it
  play today" logic decides set membership for "ชุดหลัก" directly.

## Limits (Claude's calls; builder may adjust if there's a reason)

- Up to 10 sets per creator; set names up to 40 characters; sound names up to 40.
- Minimum per sound: whole baht, 0 (free) to 100,000.
- Library limits stay as in project 1 (20 files per type).

## Left to the builder

- Table and API shapes, how the donate page loads the active set's sounds, and caching.
- How the overlay receives the picked sound (e.g. on each feed item) and how preloading treats
  set changes mid-stream.
- Exactly where the quick switcher sits on the home page.
- Tests: precedence (pick > tier > set), server pick validation including the "set changed"
  fallback, migration equivalence (alerts unchanged after deploy), and a browser pass of the
  donate page and library on mobile and desktop, light and dark.

## Roadmap (unchanged)

sound pick (this) → wheel → hype train → wishlist goal → media share → voice/video → gacha → PK →
games.
