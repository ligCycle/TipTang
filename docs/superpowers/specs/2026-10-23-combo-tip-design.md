# Combo tip ("คอมโบทิป") — design

**Date:** 2026-10-23 · **Status:** draft, awaiting the founder's review of the whole document
**Project 4 of the donation-features roadmap** (a "hype train"). Built on branch `feature-hub` after
projects 1–3 (feature hub, sound sets, spin wheel — not yet deployed; the founder ships them
together). Mockups: `.superpowers/brainstorm/1407-1792721253/content/hype-v2.html` (on stream,
approved) and `combo-settings-v2.html` (settings page, approved).

## Why

The founder had never seen a hype train. After the explanation (several tips in a short time start
a "train" on stream; each tip fills a bar and keeps it alive; full bar = next level; it ends when
the countdown runs out) they wanted it, with TipTang's own rewards, because on Twitch the reward is
platform emotes, which TipTang can't give. The standing concern: creators and viewers must not get
confused — so it gets a Thai name and as few settings as possible.

Decided with the founder:

- **Name: "คอมโบทิป"** everywhere (dashboard, stream). Not "Hype Train" — some people wouldn't
  understand it.
- **What fans get:** (a) creator-set rewards per level, for the whole chat, never money or anything
  of monetary value; (b) tip alerts get bigger as the level rises during a combo. (Not chosen: a
  "conductor" title for the top tipper, a badge on the donate page.)
- **Hidden until it starts**, and it **starts by itself from ordinary tips** — fans don't tick
  anything or pay anything extra (founder: "มันถือว่าเป็นการโดเนทแบบธรรมดา").
- **Only confirmed tips count** (same as goal, subathon, alerts, wheel). Founder: creators who want
  this will turn on auto-confirm anyway.
- **Settings like Twitch:** automatic by default — bar sizes come from the creator's real tips — with
  a difficulty choice ง่าย / กลาง / ยาก, **plus "ตั้งเอง"** where the creator types the baht for
  each level (founder asked for this). 1-hour cooldown after a combo; every counted tip resets a
  5-minute countdown.
- **End summary on stream** showing the level reached, total, number of people, the rewards won and
  the next reward that was "almost" won (mockup ④ approved: "เอาแบบนี้เลย").
- **Colours follow the creator's theme** ("แต่ละครีเอเตอร์ก็มีธีมเป็นของตัวเอง").
- **One default reward set** ("สายพูดคุย / ทั่วไป" — neutral, fits everyone), no template picker:
  - เลเวล 2: พูดสำเนียงที่แชทเลือก 1 นาที (Claude's pick; the founder rejected "read everyone's
    names" because creators do that anyway, and didn't object to this one)
  - เลเวล 3: ร้อง 1 เพลงที่แชทขอ (founder's wording)
  - เลเวล 4: ตอบคำถามแชท 3 ข้อ
  - เลเวล 5: ไลฟ์ต่ออีก 30 นาที

Standing rules: no emoji in UI (line icons), gender-neutral copy, Thai + English messages in parity
(the OBS overlays are Thai-only like the existing alert/timer overlays), settings save by
themselves, adapt to the creator.

## Goals

- A creator turns it on and it works with no numbers to think about.
- Viewers always know what the next reward is and how far away it is, and at the end what they won.
- Every reward reached lands in the creator's to-do list so nothing promised is forgotten.

## Non-goals

- Fans choosing to start a combo, paying extra for it, or any per-fan reward.
- Money, cash equivalents or valuables as rewards (forbidden by the Terms; not enforced by scanning).
- Counting unconfirmed tips.
- A manual "end combo now" button, adjustable cooldown or adjustable start rule.
- A combo banner on the donate page (founder, after the builder check: not this round; maybe later
  if creators ask). Fans see the combo on stream.

## Anti-goals

- A combo that never levels up for a small creator, or levels up every tip for a big one (that's why
  sizes adapt).
- Viewers seeing "Hype Train" or other jargon, or not understanding what the bar is for.
- A reward reached on stream that never reaches the to-do list.
- Overlay colours that clash with the creator's own theme.

## How a combo runs

- **Only while the combo OBS link is open** (founder, after the builder check): a tip counts — for
  starting or for an ongoing combo — only if the combo overlay link was being polled at the moment
  the tip was confirmed (e.g. seen within the last ~2 minutes; exact window is the builder's call).
  So confirming a backlog of pending tips after the stream starts nothing, and no cooldown is
  burned off stream. This needs its own last-seen time for the combo link (today
  `User.overlayLastSeenAt` is shared by every link and refreshed only every 5 minutes). The
  dashboard's "test on OBS" sample is unaffected.
- **Start:** a combo starts when confirmed tips from **at least 3 different fans** are confirmed
  within **5 minutes** of each other, and no cooldown is running. Different fans = different
  supporter names (trimmed, case-insensitive); all tips with an empty/anonymous name count as one
  fan (Claude's call — one person can't start it alone by tipping anonymously). The tips that start
  the combo count towards level 1.
- **During:** the countdown is 5 minutes from the last counted tip (each counted tip resets it). The
  combo is at level 1 when it starts. Each level N has a bar size (baht); filling it moves to level
  N+1 and unlocks level N+1's reward. Extra baht carries over, so one big tip can pass several
  levels (each passed level unlocks its reward and gets its own level-up moment).
- **What time counts:** the moment a tip is confirmed (manual confirm or auto-confirm), not when it
  was sent. A tip confirmed after its combo ended doesn't join that combo (it can count towards a
  new start once the cooldown is over).
- **End:** when the countdown runs out with no new counted tip. The level reached and the rewards
  stay. Then a **1-hour cooldown** — no new combo can start (tips in it still count as normal tips
  everywhere else).
- **Rejecting a counted tip** (a confirmed tip later rejected): its baht comes off the combo's total;
  levels already reached never go back and their rewards stay; the current level's bar can't go below
  empty. (Claude's call, told to the founder.)
- **Levels have no cap.** Past the last level in the table, every further level uses the last level's
  bar size (Claude's call) and has no reward.

## Bar sizes

- **Rule of the table:** row N is the baht needed *while at level N* to reach level N+1 (counted from
  zero for that level, not cumulative) and the reward unlocked *when level N is reached*. Level 1 has
  no reward.
- **Automatic (ง่าย / กลาง / ยาก):** based on the creator's **typical tip** = the median amount of
  their confirmed tips in the last 30 days (needs at least 5 tips; otherwise use max(their minimum
  tip, ฿50)). Level 1 ≈ typical × 2.5 / 3.5 / 5 (easy / medium / hard), each next level about 30%
  bigger, rounded to a tidy number (nearest ฿10, at least ฿10). Sizes are fixed when a combo starts
  (they don't change mid-combo). The page shows the resulting numbers. (Formula is Claude's call and
  may be tuned.)
- **ตั้งเอง:** switching to it fills the table with the currently computed numbers; the creator then
  edits any level's baht (whole baht ≥ 1). Adding a level row adds both baht and reward.

## On stream

- **Its own OBS link** `/overlay/<u>/combo?key=…` (one link per feature, as always; suggested size is
  the builder's call), following the existing overlay pattern (key check, polling, transparent,
  hidden when idle).
- ① **During a combo:** "คอมโบทิป · เลเวล N", the bar for the current level, "อีก ฿X → <next
  reward>" (or just "อีก ฿X ขึ้นเลเวล N+1" when the next level has none), the countdown, and the
  rewards already unlocked.
- ② **Level up:** a short celebration "เลเวล N! ปลดล็อก: <reward>", then back to ①.
- ③ **Tip alerts during a combo** (through the existing alerts link): the normal alert card gets a
  ribbon "คอมโบทิป เลเวล N"; effects grow with the level (e.g. glow → bigger celebration → screen
  shake — exact effects are the builder's call, built on the existing alert card and its
  "celebrate" effect).
- ④ **End summary** (~15 s, then hidden): "คอมโบทิปจบแล้ว", level reached, "รวม ฿X จาก N คน ·
  ขอบคุณทุกคน", each reward won with its level, and the next locked reward marked "เกือบได้!".
- **Colours:** the combo has its own colour setting; unset = the creator's alert colour; unset =
  brand pink (same chain as goal/timer colours). Bar, badge, border and summary use shades of it.
  The alert ribbon uses the alert card's own colour/theme.
- **"ทดสอบคอมโบบนจอ OBS"** plays a sample combo (~30 s: start, a level-up, the summary) through
  Redis like the other tests — not a real combo, no rewards, nothing in the to-do list.

## Rewards and the to-do list

- Reaching a level with a reward adds an item to the existing **"ภารกิจค้างทำ"** list (dashboard
  list, home block and the to-do OBS link from project 3), shown with "คอมโบเลเวล N" where wheel
  items show the fan's name. Same "ทำแล้ว" / undo / 30-day done list.
- The reward text is copied when reached (later edits don't rewrite it), like wheel results.
- If a combo's level is reached and then a counted tip is rejected, the reward stays (levels don't
  go back).

## Creator side

- **Hub card** "คอมโบทิป" with its own OBS link (the combo link), off by default, no fan-page tag
  (nothing changes on the donate page).
- **Settings page** `/dashboard/features/combo` (mockup `combo-settings-v2.html`), autosaving:
  - on/off switch and one line explaining how it works ("มีคนทิปติดๆ กัน 3 คนภายใน 5 นาที →
    คอมโบเริ่ม · ทุกทิปต่อเวลา 5 นาที · หลอดเต็ม = เลเวลขึ้น · จบแล้วพัก 1 ชั่วโมง") plus
    "ทำงานเฉพาะตอนเปิดลิงก์ OBS ของคอมโบไว้", and a status showing whether that link is connected;
  - a hint when auto-confirm is off: combos only count confirmed tips, so turning it on makes them
    smoother, with a link to that setting (Claude's call, told to the founder);
  - ① difficulty ง่าย / กลาง / ยาก / ตั้งเอง with the resulting baht per level;
  - ② the level table (level, baht, reward) prefilled with the default reward set; edit, delete,
    "+ เพิ่มเลเวล", and the line "ห้ามเป็นเงินหรือของมีมูลค่า";
  - ③ OBS link + colour + test on OBS.
- **No first-enable checklist** (Claude's call: a combo isn't random; the wheel's checklist was for
  random results). The Terms gain a line about combo rewards (same no-money rule, creator
  responsible for delivering them) next to the random-features section.

## Limits (Claude's calls)

Up to 20 level rows; reward text ≤ 40 characters; baht per level ฿1–฿100,000; start rule, countdown
and cooldown fixed (3 fans / 5 min / 5 min / 1 h).

## Shipping

Projects 1–4 ship together in one deploy (founder, 2026-10-19: everything goes out when the
roadmap batch is finished; push only on the founder's "merge push"). So the combo's schema folds
into the still-unapplied `20261018000000_feature_hub` migration on branch `feature-hub`, as
projects 2–3 did. If that plan ever changes before this is built, use a new migration instead.

## Smaller calls (Claude's, from the builder check)

- The level table and bar sizes are copied when a combo starts; edits apply to the next combo.
- Only tips count; shop orders don't.
- Re-confirming a rejected tip counts as a new confirmation at that moment (if a combo is running
  and the link is open, it joins it).
- Turning the card off ends a running combo at once with no summary; the overlay hides.
- If the last counted tip is rejected, the countdown keeps running from that tip's time.

## Left to the builder

Table shapes (fold into the unapplied `20261018000000_feature_hub` migration, as projects 2–3 did),
how combo state is advanced and ended (there is no background job runner — evaluate on tip
confirmation/rejection and on reads), locking so simultaneous confirmations can't double-count or
double-unlock, polling cadence, animation details, the overlay size, how the to-do list is
generalised to hold both wheel results and combo rewards, and exact copy beyond the lines above.
