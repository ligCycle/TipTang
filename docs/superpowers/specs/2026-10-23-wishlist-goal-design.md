# Wishlist goal (เป้าโดเนทหลายชิ้น) + goal bar styles — design

**Date:** 2026-10-23 · **Status:** approved by the founder 2026-10-23 (with the answers below and the master plan `C:Usersggtan.claudeplans-2-drifting-lemur.md`)
**Project 5 of the donation-features roadmap.** Built on branch `feature-hub` after projects 1–4
(feature hub, sound sets, spin wheel, combo tip — not yet deployed; everything ships together).
Mockups in `.superpowers/brainstorm/1407-1792721253/content/`: `wishlist-stream-v1.html` (on-stream
display modes), `wishlist-donate-v1.html` (donate page, approved), `goal-styles-v1.html` (bar styles;
founder kept ①–④).

## Why

TipTang's goal ("เป้าโดเนท") is one bar that every confirmed tip fills. Creators often want several
things (a mic, a webcam, a game). The founder wanted a wishlist where **fans choose which item their
tip helps** — that is the heart of it. Separately, the founder showed a competitor's goal settings
with several bar designs to pick from and wants the same idea: **creators choose how their goal bar
looks**.

Money still goes straight to the creator (zero custody). TipTang only records which tip helped which
item; the creator buys the item themselves. Shipping gifts to the creator (Throne-style) is out — it
would mean holding money.

## Decided with the founder

- **Merge into the existing goal**, not a separate feature (same hub card "เป้าโดเนท", same OBS
  link, same colour).
- **Keep the old single goal** ("เป้าหมายแบบเดิมไว้"): the goal has a type — **เป้าเดียว (as today)**
  or **หลายชิ้น (wishlist)**. Single is the default and behaves exactly as today.
- **Fans choose the item** on the donate page (optional, no extra price).
- **Tips with no choice go to the top item** ("ชิ้นหลัก"); the creator orders the list.
- **When an item is full:** it shows "ครบแล้ว!" (stream + donate page) and can't be chosen; unchosen
  tips flow to the next unfilled item in list order; a tip that overfills an item carries the rest to
  the next unfilled item; when every item is full, the last one keeps counting past 100% (as the
  goal does today) until the creator adds items or starts a new round.
- **Full items stay on show** until the creator deletes them — no "got it" button, no history list.
- **Deleting an item that isn't full moves its baht to the top unfilled item**, and the delete
  dialog says so first (e.g. "เว็บแคมได้ไปแล้ว ฿400 — ลบแล้วยอดนี้จะย้ายไปเข้า 'ไมค์ใหม่'").
- **Item pictures:** "ใส่รูป" on each item uploads straight into the library (คลังเสียงและรูป, the
  one place for media since project 1) or picks an existing library image; no picture = an icon.
- **On-stream display for wishlists, chosen by the creator:** ชิ้นหลัก (main item only, with a small
  "ถัดไป: …" line) / ทุกชิ้น (all items as a list) / สลับทีละชิ้น (rotate one at a time). Founder:
  "เอาหมดเลย … ให้ user เลือกเองตอนตั้งค่า".
- **Bar styles, chosen by the creator** (both goal types): ① แบบหลัก (today's bar) ② แบบใหญ่ (big
  title, figures inside a tall bar) ③ แบบกระจก (frosted glass card) ④ แบบวงกลม (percentage ring
  with title and figures beside it). Picked from small previews with a large live preview, like the
  competitor screenshot. TipTang's own designs, not copies.
- The fan-side picker (mockup approved): "ทิปนี้ช่วยซื้อ (ไม่บังคับ)", first option "ไม่เลือก (เข้า
  ชิ้นหลัก: …)", each item with picture, name, progress and a small bar, full items faded and
  disabled.
- Subathon and everything else stay untouched.

Standing rules: no emoji in UI, gender-neutral copy, Thai + English in parity (OBS overlay Thai-only
like the others), autosave, adapt to the creator, no placeholder contact details.

## Goals

- A creator on the old goal notices nothing until they choose "หลายชิ้น" or a new style.
- A fan sees every item, its progress and where an unchosen tip goes, before paying.
- Viewers on stream can tell which items exist and which are done.

## Non-goals

- Buying or shipping items for the creator; any money handling.
- A goal deadline ("สิ้นสุดใน 30 วัน" in the competitor screenshot — not requested).
- A "got it" status or a history of bought items.
- Per-item minimum tips or extra prices to choose an item.
- A fifth "thin line" style (dropped by the founder).

## Anti-goals

- An existing creator's goal bar changes look or numbers after the update.
- A fan's chosen item silently gets nothing (the baht must land on it, or on the next item only when
  it's already full).
- Money "disappearing" when an item is deleted (it moves; full items keep theirs).

## Goal types

- **เป้าเดียว (single):** title + amount + round start, exactly today's behaviour (every confirmed tip
  since "เริ่มรอบใหม่" counts; over 100% allowed). No picker on the donate page.
- **หลายชิ้น (wishlist):** up to **10 items** (Claude's call), each with name (≤ 40 chars, Claude's
  call), price (whole baht 1–1,000,000, Claude's call), optional library image and position.
  "เริ่มรอบใหม่" resets every item to ฿0 and keeps the list (with a confirm dialog).
- **Switching single → wishlist** turns the current goal into the first item (same title, amount and
  progress) — Claude's call. Switching back shows the top item as the single goal (Claude's call;
  the builder may refine).

## How money is assigned (wishlist)

- Counts confirmed tips since the round started, timed by confirmation, like today.
- A tip with a chosen item goes to that item; if the item is already full (or gets full part-way),
  the rest goes to the next unfilled item in list order (wrapping from the top, Claude's call). A
  tip with no choice goes to the top unfilled item. When all items are full, extra goes to the last
  item and it shows over 100%.
- Rejecting a tip later removes its baht (as the goal does now); an item that showed "ครบแล้ว!" may
  drop back below full (Claude's call).
- Deleting an unfilled item moves its baht to the top unfilled item; deleting a full item keeps its
  baht out of the other items (it simply disappears from view).
- Lowering an item's price below what it has makes it full, and the extra flows on (Claude's call).
- Server checks a chosen item at tip time (exists, belongs to the creator's wishlist, not full); an
  invalid choice is treated as "no choice" (the tip still goes through) — Claude's call, same
  pattern as a dropped sound pick.

## Donate page

- Wishlist with **2+ unfilled items**: the "ทิปนี้ช่วยซื้อ (ไม่บังคับ)" picker in the extras area
  (with the wheel and sound pick). With only one unfilled item, no picker (Claude's call).
- The existing goal progress block on the profile shows the single goal as today; for a wishlist the
  picker list replaces it (Claude's call), and when the picker is hidden the one remaining item shows
  like today's goal block.

## On stream (existing goal OBS link)

- Single goal: drawn in the chosen style.
- Wishlist: chosen display mode × chosen style. ชิ้นหลัก and สลับทีละชิ้น draw one item in the full
  style; ทุกชิ้น draws a list (up to 4 items, then "+N ชิ้น" — Claude's call) where each row uses a
  compact version of the style (the ring shrinks to a small ring before the name).
- สลับทีละชิ้น shows each item ~8 s; an item that just received a tip comes up next (Claude's call).
- When an item becomes full: a short "ครบแล้ว! ขอบคุณทุกคน" moment with "฿X จาก N คน".
- Colours follow the existing goal colour → alert colour → brand pink chain.
- Default for new wishlists: ทุกชิ้น + แบบหลัก (Claude's calls).

## Creator side

- Same hub card "เป้าโดเนท"; its one-line description mentions several items (Claude's call; the
  word "wishlist" isn't shown to Thai users, like "Hype Train" wasn't).
- Goal settings page: type (เป้าเดียว / หลายชิ้น), style picker with previews + live preview, then
  for wishlists the item list (picture, name, price, drag to reorder, delete with the dialog above,
  "+ เพิ่มของ") and the display mode. Autosave.
- Tips list: badge "ช่วย: <item>" on tips that chose an item. Alert card: a small line "ช่วยซื้อ
  <item>" for those tips (Claude's calls, told to the founder).

## Decided after the builder check (founder, 2026-10-23)

- **Money that already landed stays where it landed.** Reordering items, raising a price or adding
  an item never moves baht that is already on an item. Money moves only on: deleting an unfilled
  item (its baht → top unfilled item), lowering a price below what's raised (overflow → next
  unfilled item), and rejecting a tip (that tip's baht leaves). So allocations are **stored per tip
  at confirmation time**, not recomputed from all tips on every read. An item that showed "ครบแล้ว!"
  can drop below full after a reject; the fan's overflow that went elsewhere stays there.
- **Goal card off → the "ทิปนี้ช่วยซื้อ" picker is hidden** and tips confirmed then count as "no
  choice". The profile goal block keeps today's behaviour (shown regardless of the card).

## From the master plan (rulings R1, R5)

- **R5 — one confirm/reject pipeline:** before the wishlist hook is added, the per-feature hooks
  (wheel spin, combo) move into `src/lib/tip-hooks.ts` — `onTipConfirmedTx` / `onTipRejectedTx` lock
  the Tip, then the creator's User row once, then call the features in a fixed order (wheel → combo
  → wishlist → later features). Both tip routes call only this pipeline; transactions get an explicit
  timeout.
- **R1 — extras add up:** the wishlist choice has no price, but it joins the donate page's extras
  area and the shared floor helper (`extrasFloor`) that later projects use.

## Left to the builder

Tables and how allocation is computed (live from tips, like `goalRaised`, or stored per tip — but
the delete rules above must hold, so a deleted full item needs to keep its baht out of the others),
how styles are implemented, image handling details within the library, the exact settings layout,
polling, and migration placement (fold into the unapplied feature-hub migrations as projects 2–4
did).
