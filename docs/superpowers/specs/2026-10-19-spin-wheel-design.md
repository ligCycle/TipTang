# Spin wheel ("วงล้อสุ่ม") — design

**Date:** 2026-10-19 · **Status:** approved by the founder 2026-10-19
**Project 3 of the donation-features roadmap.** Built on branch `feature-hub` after projects 1–2
(not yet deployed; the founder ships them together).

## Why

The founder picked a spin wheel from the competitor research but had never seen one used. From
examples, they liked all three common uses: a **task wheel** (the streamer must do something —
sing a line, ten push-ups), a **fan reward wheel** (the tipping fan gets something — pick the
next game, a shout-out), and a **game wheel** (a rule change in the game being played). The
founder's standing concern: creators must not get confused setting it up.

Decided with the founder:

- TipTang ships ready-made **templates** (task / fan reward / game) with example slices; the
  creator can then edit, add and remove slices, and keep several wheels.
- The **fan chooses to spin** on the donate page, like picking a sound; it costs a minimum tip
  set by the creator. Spin + sound in one tip **add up** (spin ฿50 + sound ฿30 → tip ≥ ฿80).
- The donate page **shows every slice** and says all slices are equally likely.
- Results go to a **to-do list** ("ภารกิจค้างทำ") the creator ticks off ("✓ ทำแล้ว"), and the
  list is **also shown on stream** through its own OBS link.
- **One switch per wheel** (not per slice): "ช่องที่ออกแล้ว ลบออกจากวงล้อ" — when on, a slice
  that comes up is removed from the wheel; a "รีเซ็ตวงล้อ" button brings all slices back.
- When a removing wheel runs out of slices, the spin option **disappears from the donate page**
  until the creator resets it.
- Rules for random features (approved earlier): **Terms of use + a first-enable checklist**,
  nothing more ("เป็นความรับผิดชอบของครีเอเตอร์").
- Mockup `wheel-v1.html` (in `.superpowers/brainstorm/197-1792406567/content/`) approved:
  "ไม่งง".

Standing rules: no emoji in UI (line icons), gender-neutral copy, Thai + English messages in
parity, settings save by themselves where safe, adapt to the creator.

## Goals

- A creator turns the wheel on and has a working wheel within a minute (pick a template, tick the
  checklist, set a price).
- A fan knows exactly what they can win/trigger and what it costs before paying.
- Every paid spin shows on stream and lands in the to-do list; nothing gets lost when several
  spins arrive at once.

## Non-goals

- Weighted odds (all slices equal — prevents quietly making good slices rare).
- Prizes of money or anything of monetary value (forbidden by the Terms; not enforced by text
  scanning).
- Fans spinning without tipping, or more than one spin per tip.
- Per-slice "remove when hit" settings.

## Anti-goals

- A fan pays for a spin and nothing happens on stream / nothing is recorded.
- The same slice comes up twice on a removing wheel because two spins raced.
- The creator has to understand anything beyond: วงล้อ, ช่อง, ราคาต่อการหมุน, ลบช่องที่ออกแล้ว,
  รีเซ็ต, ภารกิจค้างทำ.

## Concepts

- **Wheel**: name, slices (2–12), price per spin (whole baht ≥ 1), the remove-when-hit switch,
  and which slices are currently removed. A creator can have several wheels; **exactly one is
  in use** at a time (Claude's call, same pattern as sound sets), chosen on the wheel page.
- **Slice**: text (≤ 40 characters), and a "ไม่ต้องทำอะไร" flag (e.g. "เสียดาย ไม่ได้อะไร") —
  such results skip the to-do list. Colours are assigned automatically.
- **Spin**: created for a tip whose fan ticked "หมุนวงล้อ", once that tip is confirmed (manually
  or by auto-confirm). The **server decides the slice** at that moment (uniform random over the
  wheel's current slices) and records it; the overlay only animates to the recorded result
  (Claude's call: fair, tamper-proof, and the remove-when-hit switch can't race).
- **To-do item**: a spin whose slice isn't "ไม่ต้องทำอะไร". Shows slice text, fan name, tip
  amount, time; "✓ ทำแล้ว" marks it done (undo available in the done list).

## Fan side (donate page)

- A "ลูกเล่นตอนทิป (ไม่บังคับ)" area holds a "หมุนวงล้อ <wheel name>" checkbox card with the price
  and "ผลออกตอนวงล้อหมุนบนไลฟ์", plus "ดูช่องในวงล้อ (N ช่อง)" which expands the slice list and
  "ทุกช่องมีโอกาสออกเท่ากัน". The sound picker (project 2) sits in the same area.
- Shown only when the wheel card is on, a wheel is in use, and it has at least one slice left.
- The combined minimum (creator minimum, spin price, picked sound's price) is shown and enforced
  like the sound picker: options the amount doesn't cover can't be ticked, the amount is never
  raised for the fan, and lowering the amount clears what it no longer covers (checked when the
  amount field is left, as in project 2).
- Server: the spin request stands only if the wheel card is on, the wheel in use has slices, and
  amount ≥ max(creator minimum, spin price + picked sound price). Otherwise the tip still goes
  through without the spin and the thank-you screen says so (same pattern as a dropped sound).

## On stream

- **Wheel link** `/overlay/<u>/wheel?key=…` (suggested size Claude's call, e.g. 600×600): when a
  spin is ready, the wheel appears, spins ~5 s, stops on the recorded slice, shows "<fan> หมุนได้
  <slice>!" for a few seconds, then hides. Spins queue and play one after another.
- **To-do link** `/overlay/<u>/todo?key=…`: a compact list of open items (newest last, up to ~8
  visible, "+N" when more), updating within seconds of a spin or a tick.
- Both follow the existing overlay pattern (key check, polling, transparent background,
  "test on OBS" sample from the dashboard).

## Creator side

- **Hub card** "วงล้อสุ่ม" with the fan-page tag, its own OBS link (the wheel link), off by
  default. Turning it on the first time opens the **first-enable checklist** (below) and then a
  template picker; the wheel page also offers both if skipped.
- **Wheel page** `/dashboard/features/wheel`: wheel tabs + "+ วงล้อใหม่" (from a template or
  empty); per wheel: name, price, the remove-when-hit switch, "รีเซ็ตวงล้อ", slice rows (text,
  "ไม่ต้องทำอะไร", delete; removed slices shown faded), "+ เพิ่มช่อง", "ใช้วงล้อนี้", delete wheel
  (not the one in use), the to-do OBS link, test on OBS. Everything autosaves.
- **To-do list** on the wheel page and a compact "ภารกิจค้างทำ (N)" block on the dashboard home
  (Claude's call) with "✓ ทำแล้ว"; a "ทำแล้ว" tab with undo.
- Tips list shows a "หมุนวงล้อ: <slice>" badge on tips that spun.

## Rules (approved: two layers only)

- **Terms of use**: a new section on random features — results are random with equal odds;
  rewards must not be money, cash equivalents or items of monetary value; the creator is
  responsible for what is on their wheel and for carrying out results; TipTang only records and
  displays.
- **First-enable checklist**: three statements the creator must tick before the card turns on
  (no money/valuables as rewards; slices visible to fans and equal odds; they'll do what the
  wheel shows or mark it themselves). Ticked once per creator; time stored.

## Templates (Claude's call; editable copy)

- ภารกิจ (remove-when-hit off): ร้องเพลง 1 ท่อน, วิดพื้น 10 ครั้ง, พูดสำเนียงใต้ 1 ตา,
  ปิดเสียงเกม 5 นาที, เต้น 10 วิ, อ่านคอมเมนต์ด้วยเสียงสูง 1 นาที, เสียดาย ไม่ได้อะไร
  (no action). No "spin again" slices (one spin per tip).
- รางวัลแฟน (remove-when-hit on): ได้ตะโกนชื่อบนไลฟ์, เลือกเกมต่อไป, ถาม 1 คำถาม,
  ตั้งชื่อตัวละคร, เสียดาย ไม่ได้อะไร (no action) ×2.
- เกม (off): ใช้แค่ปืนพก, ห้ามกระโดด 1 นาที, เปลี่ยนตัวละคร, เล่นกลับหัวกล้อง, เสียดาย ไม่ได้อะไร.
- Default price ฿50.

## Limits (Claude's calls)

10 wheels per creator; 2–12 slices; slice text ≤ 40 chars; price ฿1–฿100,000; to-do list keeps
done items 30 days.

## Left to the builder

Table/API shapes, polling cadence, animation details, how the spin queue is stored, where the
"test on OBS" sample lives, and migration placement (it's fine to fold into the unapplied
feature-hub migrations, as project 2 did).

## Decided after the builder check (founder, 2026-10-19)

- **Spin uses the wheel the fan saw.** The tip stores the wheel id when sent. At confirm time the
  spin uses that wheel's slices still left then, even if the creator has since switched wheels,
  raised the price or turned the card off (the fan paid already). If that wheel was deleted or is
  empty, the confirm button warns the creator first ("ทิปนี้ขอหมุนวงล้อ แต่วงล้อหมดแล้ว"); they may
  reset the wheel before confirming, or confirm without a spin (the tip row then says so).
- **Missed spins play late, within 1 hour.** A spin not yet shown on stream plays when the wheel
  OBS link next loads, if it was confirmed within the last hour; older ones only appear in the
  to-do list. The server records which spins have played (first overlay to fetch claims it).
- **Rejecting a confirmed tip cancels its spin.** The to-do item goes, a removed slice comes back
  to its wheel, an unplayed spin is cancelled. Confirming again restores the same result (no
  re-roll).

## Slots per task and limits (founder, 2026-10-19 — supersedes the limits above)

- A wheel has **tasks** (what was called slices above) and one wheel-level setting
  **"แต่ละภารกิจมีกี่ช่อง"** (1–4, default 1) applied to **every** task equally (founder: "บังคับ
  ให้หมดเลย" — no per-task counts, so every task keeps equal odds). The wheel drawn on stream has
  tasks × slots-per-task segments; copies of the same task are spread evenly around the wheel.
- The random draw is uniform over the **remaining segments**.
- With "ลบช่องที่ออกแล้ว" on, only the **segment that came up** is removed (founder); the task's
  other segments stay. "ดูช่องในวงล้อ" on the donate page lists each task with its remaining
  segment count (e.g. "วิดพื้น 10 ครั้ง · 2 ช่อง"), and the line says "ทุกช่องมีโอกาสออกเท่ากัน".
  Reset restores every segment. The wheel is empty (spin option hidden) when no segments remain.
- Limits: 2–24 tasks per wheel; at most 48 segments drawn (if tasks × slots exceeds 48, the
  slots-per-task picker caps itself and says why); 20 wheels per creator; task text ≤ 40 chars.
