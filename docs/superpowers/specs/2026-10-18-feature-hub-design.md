# Feature hub ("บ้านของลูกเล่น") — design

**Date:** 2026-10-18 · **Status:** awaiting founder approval of this document
**Project 1 of the donation-features roadmap** (see "Roadmap" at the end).

> **Revision 2026-10-19 (founder):** the single 1920×1080 OBS link with 3×3 positions was dropped —
> it made creators fit their scene to TipTang. Each feature keeps its own OBS link (the existing
> alerts / goal / timer URLs), copied from its card on the hub or section ① of its settings page,
> and creators move and resize it freely in OBS. Removed: `/overlay/[username]/live`, the combined
> state endpoint, the position picker and the three position columns. Sections below that
> describe the single link are superseded by this note.

## Why

The founder wants many new donation gimmicks (sound picks, spin wheel, hype train, media share,
gacha, PK, …). Two things make that dangerous for TipTang today:

1. **Creators already get lost.** Activation data (2026-10-09) shows most sign-ups drop at the OBS
   step, before they ever touch a feature. The creator-side "OBS overlay" page
   (`src/components/OverlaySettings.tsx`, ~1,500 lines) is one long page mixing OBS connection,
   alert look/sound/TTS, goal and subathon timer. Appending ten more features to it would bury
   the OBS step even deeper.
2. **Every new feature currently means a new OBS link.** Alerts, goal and timer are three separate
   browser sources (`/overlay/[username]`, `/goal`, `/timer`). Competitors do the same (EasyDonate:
   one link per widget; Streamlabs: per-widget URLs or its own desktop app/plugin).

The founder reviewed EasyDonate (direct competitor, same PromptPay + slip model) and Streamlabs
in their own accounts, and approved a combined layout in a mockup review. Their words: the
widget settings at EasyDonate "are many and confusing at first"; everything else was clear.

So before adding gimmicks, build the house they live in: a grouped dashboard menu, a "ลูกเล่น"
hub of on/off cards, one settings-page pattern, a first-visit chooser, and **one OBS link** that
shows every enabled feature. Ship it with the existing features plus one new one (alert tiers by
amount) that fits the new settings page naturally.

## Goals

- A new creator opening the hub knows within seconds what is on, what each thing does, and how to
  turn something on.
- Adding a future feature = adding one card + one settings page + one overlay widget, without
  touching the others.
- One OBS browser source shows all enabled on-screen features.
- Alert tiers by amount (founder's item 1).

## Non-goals (this project)

- Any new gimmick other than alert tiers (sound picks, wheel, hype train, etc. come later, one per
  project).
- Changes to the fan donation page. The "เพิ่มลูกเล่นให้ทิปนี้" row ships with the first fan-side
  feature (sound picks), because there is nothing to put in it yet.
- Redesigning the profile/payout settings content (`SettingsForm.tsx`) — only its place in the menu
  changes.
- An on-screen leaderboard widget (the leaderboard exists only on the public profile today).

## Anti-goals (failure even if it "works")

- **A creator's live stream changes or breaks** because of this release. Existing overlay URLs
  must keep rendering exactly what they render today.
- The hub lists features that don't exist yet ("coming soon" cards). Only shipped features appear.
- Emoji used as UI icons (project rule: line icons via `src/components/Icon.tsx`, no emoji in UI).
  The mockup used emoji only as placeholders.
- A preset or toggle silently overwrites settings a creator already chose.

## Constraints

- Next.js 16 App Router as used in this repo — read the relevant guide in `node_modules/next/dist/docs/`
  before writing code (AGENTS.md). Server/route conventions as in existing code.
- All UI copy in `messages/th.json` and `messages/en.json`; Thai is primary. Gender-neutral copy
  (no ครับ/ค่ะ). Dark mode and the creator colour theme (`CreatorTheme`, `src/lib/creator-theme.ts`)
  must keep working on every new page.
- Schema changes need a Prisma migration; **production migrations run only on the founder's
  explicit go-ahead**. Never test against the production DB (use the local prisma dev DB).
- Overlay endpoints are authorised by the overlay key in the query string (existing pattern,
  `src/app/api/overlay/[username]/route.ts`); keep that model and the existing
  `overlayLastSeenAt` heartbeat (`src/lib/overlay-connection.ts`).
- Tests: `npm test` (node --test, pure lib modules). Put new pure logic (tier matching, preset
  mapping, position mapping) in `src/lib/` with tests.
- Push/deploy only when the founder says "merge push".

## Decisions (approved in conversation)

### 1. Dashboard menu

A left sidebar on desktop with grouped items (on mobile it collapses — see "Left to the builder"):

| Group | Item | Target |
|---|---|---|
| ภาพรวม | หน้าหลัก | `/dashboard` (stats, onboarding checklist, review invite, latest tips) |
| ภาพรวม | รายการทิป | new page: the full tip list (moved from the dashboard home) |
| ฝั่งแฟน | หน้าโดเนท | existing `/dashboard/settings` (profile, payout, donation page sections) |
| บนจอสตรีม | ลูกเล่น | new hub (replaces `/dashboard/overlay`) |
| บนจอสตรีม | คลังเสียงและรูป | new page: the alert asset library (moved out of `OverlaySettings`) |
| บัญชี | ตั้งค่าบัญชี | new page holding the existing account components (`ConnectedAccounts`, `AccountSecurity`), moved out of `/dashboard/settings` |

Every menu item has its own route, so the active item is simply the current route (no hash-based
highlighting). The admin link stays visible to the admin only. `/dashboard/overlay` redirects to the hub so old
bookmarks and the guide page keep working.

### 2. The hub ("ลูกเล่น")

Top to bottom:

1. **OBS card** — the single OBS link (copy button) and the existing connection status
   (`OverlayConnectionStatus`). One line: "ใส่ใน OBS ครั้งเดียว ลูกเล่นที่เปิดจะขึ้นจอเอง".
   Creators who already use the old separate links see a dismissible note that their links keep
   working and the single link is optional.
2. **เปิดใช้อยู่** — cards of enabled features.
3. **แนะนำให้ลอง** — up to 3 cards of disabled features.
4. **ลูกเล่นทั้งหมด** — folded; category tabs appear once there are enough features to need them
   (with three features, a flat list is enough).

Each card: line icon, name, one-line description, on/off switch that works directly from the card,
and "ตั้งค่า →". Cards for features that add something to the fan page carry an orange
"โผล่ในหน้าโดเนท" tag (none in this project, but the card component supports it).

Features in this project: **แจ้งเตือนทิป**, **เป้าหมาย**, **Subathon**.

### 3. Feature settings page pattern

`ลูกเล่น → <feature>`: back link, title, enable switch. Left: live preview of the widget plus test
buttons. Right: collapsible sections numbered by importance. The existing controls from
`OverlaySettings.tsx` move into these pages unchanged in behaviour; only their arrangement
changes. Every on-screen feature gets a **position on screen** control (see 5).

Alert settings sections: ① หน้าตา (theme, colour, style, position) ② เสียงและรูป (sound, image,
video, library random) ③ อ่านข้อความ (TTS) ④ แยกตามยอดเงิน ⑤ ตั้งค่าเพิ่มเติม.
Goal and Subathon pages carry their existing settings in the same pattern.

**Test on OBS:** a button that makes a sample alert appear on the creator's real OBS overlay
(single link and the old alert link) within a few seconds. A test plays exactly like a real alert
(sound, visual, TTS if enabled) but is never stored as a tip and never moves the goal, the subathon
timer or the leaderboard, and sends no email. Buttons "ลองยอด ฿20" / "ลองยอด ฿500" preview the tiers in the page preview.

### 4. Alert tiers by amount (new feature)

- Up to **5 tiers**, each defined by a minimum amount in whole baht.
- A tip uses the tier with the highest minimum that is ≤ the tip amount; below the lowest tier, the
  normal alert applies.
- Each tier may override: **sound**, **visual** (an image or a video; a tier visual replaces the
  normal visual entirely), and **time on screen**. Anything not overridden comes from the normal
  alert settings, including library-random behaviour. (My call — see "Calls I made".)
- A tier's sound or visual is one specific asset, uploaded or picked from the existing asset library.
- Tiers apply everywhere alerts render (old alert link and the single link). PayPal tips use their
  confirmed THB amount like PromptPay tips.

### 5. One OBS link

- A new overlay route renders a 1920×1080 stage and shows every enabled on-screen feature at its
  chosen position. The old routes stay unchanged.
- OBS setup text for the single link tells the creator to add one browser source sized 1920×1080
  (OBS scales it to any canvas). The `/guide` page's OBS steps are updated to the single link.
- Positions: a fixed set of anchors (corners, edge centres, centre). Sensible defaults per feature
  (my call: alerts centre, goal bottom centre, timer top right). Positions affect only the single
  link; the old per-feature links keep filling their own browser source as today.
- The alert enable switch is new (alerts are always on today); default on. Goal and timer already
  have enable flags (`goalOverlayEnabled`, `timerEnabled`) — reuse them.
- The single link uses the same overlay key and feeds the same heartbeat, so connection status and
  the activation rule ("overlay polled in 14 days") keep working.

### 6. First visit to the hub

A one-time popup: "สตรีมของคุณเป็นแบบไหน" with options limited to what exists:
**พื้นฐาน** (alerts) · **ตั้งเป้าหมาย** (alerts + goal) · **Subathon** (alerts + timer + goal) ·
"ข้าม ตั้งเอง". If the creator has never connected an overlay, the popup first walks them through
adding the single link to OBS. A preset only switches features on; it never changes settings the
creator already set. The popup shows once per account (stored server-side, not only in the
browser).

### 7. Rules for random features (approved; applies when the wheel and gacha are built)

Two layers; responsibility sits with the creator. No line on the fan page.

**Layer 1 — Terms of use, section "ลูกเล่นแบบสุ่ม" (วงล้อ กาชา และลูกเล่นที่ผลออกแบบสุ่ม):**
1. ลูกเล่นแบบสุ่มมีไว้เพื่อความบันเทิงบนสตรีมเท่านั้น เงินที่ผู้สนับสนุนโอนคือทิปให้ครีเอเตอร์โดยตรง ไม่ใช่ค่าเข้าเล่นหรือเงินเดิมพัน
2. ครีเอเตอร์ต้องไม่ตั้งผลสุ่มเป็นเงิน ของรางวัล บัตรกำนัล โค้ด ไอเทม หรือสิ่งที่มีมูลค่าใด ๆ ที่ผู้สนับสนุนจะได้รับ และต้องไม่สัญญาว่าจะให้สิ่งเหล่านี้ตามผลสุ่ม ทั้งใน TipTang และช่องทางอื่น
3. ผลสุ่มต้องเป็นกิจกรรมที่ครีเอเตอร์ทำเอง เช่น ร้องเพลง ทำภารกิจ บทลงโทษ หรือเอฟเฟกต์บนจอ
4. ห้ามใช้ลูกเล่นแบบสุ่มจัดกิจกรรมชิงโชค จับรางวัล หรือเสี่ยงโชคใด ๆ
5. ครีเอเตอร์รับผิดชอบสิ่งที่ตั้งไว้ และการปฏิบัติตามกฎหมายที่เกี่ยวข้องทั้งหมดเอง TipTang ไม่รับผิดชอบต่อการใช้งานที่ฝ่าฝืนข้อเหล่านี้
6. TipTang มีสิทธิ์ปิดลูกเล่น ลบผลสุ่มที่ฝ่าฝืน หรือระงับบัญชีได้โดยไม่ต้องแจ้งล่วงหน้า

**Layer 2 — checklist the first time a creator enables the wheel or gacha** (all boxes required;
the acceptance time is stored as evidence):
- ผลบนวงล้อหรือกาชาของฉันเป็นกิจกรรมที่ฉันทำเองบนสตรีม
- ฉันจะไม่ให้เงิน ของรางวัล หรือของมีมูลค่ากับแฟนตามผลสุ่ม ทั้งใน TipTang และช่องทางอื่น
- ฉันรับผิดชอบสิ่งที่ตั้งไว้และการปฏิบัติตามกฎหมายเอง
Buttons: [อ่านเงื่อนไขฉบับเต็ม] [ยอมรับและเปิดใช้].

Product guardrail: the wheel and gacha settings have no "prize" or "value" fields. Clause 4 is
deliberately strict; the founder should have someone with legal knowledge read the set before
the wheel ships.

## Technical notes (from the founder's review, 2026-10-18)

1. **Test on OBS signal:** store the test payload in Upstash Redis keyed by creator with a short TTL
   (about 10–15 s), not in Postgres — nothing test-related is ever written to `Tip` or other tables.
   Do **not** delete it on first read: a creator may run the old alert link and the single link at
   the same time, and both must show the test. Give each test an id; every overlay client shows a
   given id once. Locally (no Upstash env) use the same in-process fallback pattern as
   `src/lib/ratelimit.ts`.
2. **One poll for the single link:** today the alert, goal and timer overlays poll separately
   (every 3 s, 5 s and 4 s). The single-link page must make one poll for the combined state and pass
   it down to the alert, goal and timer views; it must not run three pollers. The old routes keep
   their own polling unchanged.
3. **Stacking:** the alert view always renders above every other widget on the single link, so a
   widget placed in the same spot never covers an alert. The position control warns when two
   features share an anchor.
4. **Menu active state:** solved by giving every menu item its own route (decision 1).

## Left to the builder

- Route names (hub, tips page, library page, single overlay route) and file layout.
- Mobile behaviour of the sidebar (collapsed menu, drawer or horizontal tabs), as long as every
  item is reachable in one tap from any dashboard page.
- Schema shape for tiers, positions, the alert enable flag and the first-visit flag, and how the
  test-on-OBS signal reaches the overlay (the repo has Upstash Redis and Postgres available).
- How the single overlay composes the existing `OverlayClient`, `GoalOverlayClient` and
  `TimerOverlayClient` (reuse over rewrite).
- Exact copy beyond the strings quoted here, following the existing tone in `messages/th.json`.
- Splitting the work into reviewable steps.

## Calls I made (founder: check these while reading)

1. Tiers override only sound, image/video and time on screen — not theme, colour or TTS.
2. Maximum 5 tiers.
3. Default positions on the single link: alerts centre, goal bottom centre, timer top right.
4. The full tip list moves to its own "รายการทิป" page; the dashboard home keeps the latest few with
   a "ดูทั้งหมด" link (my call: 5 latest, with the same confirm/reject actions).
5. "หน้าโดเนท" points to the existing `/dashboard/settings` page; "ตั้งค่าบัญชี" becomes its own small
   page reusing the existing account components, so each menu item has one route and one active state.
6. Old overlay links are never retired; the hub only suggests the single link.

## Roadmap (one project each, in this order, after this one)

1. ให้แฟนเลือกเสียง (adds the fan-page row) · 2. วงล้อ (with the rules above) · 3. Hype train ·
4. เป้าหมายมีรูปของที่อยากได้ · 5. ขอคลิปหรือเพลง · 6. ฝากเสียงหรือวิดีโอ · 7. กาชา (with the rules
above) · 8. PK · 9. เกม. Tip-weighted polls were dropped (YouTube has free polls; hard to use).
