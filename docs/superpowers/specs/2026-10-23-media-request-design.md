# ขอคลิป/เพลง (fan media request) — design

Project 6 of the "เพิ่มลูกเล่นการโดเนท" roadmap (master plan
`C:\Users\ggtan\.claude\plans\1-2-drifting-lemur.md`, approved 2026-10-23).
Founder decisions come from that plan; the calls marked *ruling* are mine
(founder: "ตัดสินเอง จดไว้ รายงานตอนจบ").

## What it is

- A fan pastes a YouTube link with a tip. Once the creator approves it, the
  clip plays on stream from a queue.
- The creator approves each clip, or turns on **อนุมัติอัตโนมัติ**. That switch
  first shows a copyright warning the creator must confirm (founder).
- This project builds the shared **media queue** and the `/media` OBS link.
  Project 7 (ฝากเสียง) adds the second kind, `voice`, to the same queue (R6).

## Fan side (donate page)

- **One "สื่อจากแฟน" block in TipForm** (R1). In P6 it holds one choice,
  "ขอคลิป/เพลง"; P7 adds "ฝากเสียง" as the second, and a tip carries one or the
  other, never both.
- **Link field:**
  - Accepts YouTube `watch?v=`, `youtu.be/`, `shorts/`, `live/` and
    `m.youtube.com` / `music.youtube.com` links.
  - An optional start time (`t=90`, `t=1m30s`, `start=`) is kept.
  - Anything else gets "ใส่ลิงก์ YouTube เท่านั้น".
- **Preview:**
  - On blur or paste, the page calls `GET /api/media/preview?u=<username>&url=`
    (rate-limited). It checks the link via YouTube oEmbed and returns
    `{videoId, title, thumb, start}`.
  - The fan sees the thumbnail and title. A video that oEmbed refuses (private,
    deleted, or not embeddable) gets "คลิปนี้เล่นบนจอไลฟ์ไม่ได้".
- **Price:**
  - The creator's `mediaMinAmount` (default ฿50) adds to the other extras
    through `extrasFloor` (R1). The amount is never raised for the fan, and
    the option is locked while the amount is below the floor (same as the
    wheel).
  - Fine print (always shown): "เล่นสูงสุด X นาที · ครีเอเตอร์อาจข้ามหรือไม่เล่นคลิปที่ไม่เหมาะสม".
- **Server (`POST /api/tips`):**
  - Re-validates the link (parse + oEmbed). A tip sent with both media kinds
    → 400 `media_both`.
  - If the link fails, the card is off, or the amount is below the floor, the
    tip still goes through without the clip and the fan is told why
    (`mediaDropped`, like `spinDropped`). The fan has paid; never block the tip.

## Data

`MediaRequest` (one per tip, `tipId @unique`):

- **Columns:** `id`, `userId`, `tipId`, `kind` ("clip"; "voice" in P7),
  `videoId`, `title`, `startSec`, `status`, `position` (queue order),
  `createdAt`, `queuedAt`, `startedAt`, `endedAt`.
- **Status:**

  | Status | Meaning | Visible in queue? |
  |---|---|---|
  | `HELD` | Tip not confirmed yet | No |
  | `PENDING` | Waiting for approval | Yes |
  | `APPROVED` | Waiting to play | Yes |
  | `PLAYING` | On stream now | Yes |
  | `PLAYED` | Finished | History |
  | `SKIPPED` | Creator skipped it | History |
  | `REMOVED` | Creator removed it before it played | History |
  | `CANCELLED` | Tip rejected | No |

User fields:

| Field | Default | Notes |
|---|---|---|
| `mediaEnabled` | `false` | |
| `mediaMinAmount` | `50` | |
| `mediaMaxSec` | `180` | Choices 60/120/180/300/600 |
| `mediaAutoApprove` | `false` | |
| `mediaAutoAckAt` | null | When the copyright warning was confirmed |
| `mediaVolume` | `70` | 0–100 |
| `mediaPaused` | `false` | Queue on hold |
| `mediaSeenAt` | null | Last poll of the OBS link |
| `mediaColor` | null | Falls back to `alertColor` |

- Schema is folded into the unapplied
  `prisma/migrations/20261018000000_feature_hub/migration.sql`, with RLS
  enabled on the new table like the others.

## Lifecycle (R5 pipeline)

- **Tip created with a clip:** a `HELD` row is written with the tip, in the
  same create.
- **`onTipConfirmedTx`:**
  - `mediaConfirmTx` turns `HELD` (or `CANCELLED`, when a rejected tip is
    confirmed again) into `PENDING`, or into `APPROVED` when auto-approve is on.
  - It sets `queuedAt = now` and `position` = last + 1.
  - Pipeline order: wheel → combo → wishlist → **media**.
- **`onTipRejectedTx`:** `mediaRejectTx` sets any not-yet-finished row to
  `CANCELLED`. A clip that is `PLAYING` stops at the overlay's next poll.
- **Card off:** confirmed clips stay in the queue (the money is already in).
  The overlay plays nothing while the card is off.

## Playing (`/overlay/<u>/media`, R6)

- **The server owns the queue:**
  - `GET /api/overlay/<u>/media?key=` (key-checked) returns `{current, volume,
    maxSec, paused, color}`. `current` = the `PLAYING` row, or else it promotes
    the first `APPROVED` row by `position` to `PLAYING`.
  - Promotion happens only when the card is on and not paused.
- **The overlay:**
  - Plays `current` with the YouTube IFrame API on `youtube-nocookie.com`
    (autoplay, start at `startSec`).
  - It stops at `maxSec`, or when the video ends or errors, then posts
    `POST /api/overlay/<u>/media?key=` `{id, event: "ended"|"error"}` → `PLAYED`.
  - It polls every 3 s. When `current` changes, it switches the video, which
    covers skips and rejects.
- **Safety net:** a `PLAYING` row whose `startedAt` is older than
  `maxSec + 30 s` counts as played on the next poll, so a closed OBS link
  doesn't jam the queue.
- **On-stream card:** a small card shows "ขอโดย <fan> · ฿<amount>" with the
  clip title in the creator's colour, under the player. No fan message (the
  alert already showed it).
- **Two open sources:** the second one shows the same `current`. Only the
  first `ended` post counts, so two sources don't double-skip. A post for a row
  that isn't `PLAYING` is ignored.

## Creator side

- **Hub card:** "ขอคลิป/เพลง" (`media`), icon `music`, fan-page tag,
  `obsPath: "/media"`, `obsSize: "640×480"` (*ruling*: 16:9 player + card).
  Toggle kind `mediaToggle`.
- **Settings page** (`/dashboard/features/media`):
  - **① Queue "คิวสื่อจากแฟน":**
    - Now playing, with skip.
    - Waiting for approval: approve / remove.
    - Up next: move to top / remove.
    - History: last 20 within 24 h.
    - A "หยุดคิวชั่วคราว" switch.
  - **② Settings:** on/off, minimum amount, maximum length, auto-approve
    (warning dialog), volume slider.
  - **③ OBS link + colour** + "ทดสอบบนจอ" (test clip).
  - The page polls the queue every 5 s while open.
- **Auto-approve warning** (dialog, must tick "เข้าใจแล้ว"):
  - Clips play without review.
  - The creator is responsible for copyright and content on their stream.
  - Platforms (YouTube/Twitch/TikTok/Facebook) may mute, take down or strike
    for copyrighted music.
  - The creator can still skip anything.
  - Confirming stores `mediaAutoAckAt`; it's asked again only if that is null.
- **Test on OBS:** puts a fixed test clip at the top of the queue as an
  `APPROVED` row with no tip.
  - *Ruling:* `tipId` is nullable for test rows, which carry
    `title "ทดสอบ"`.
  - The video is a creator-chosen link, falling back to a constant
    royalty-free YouTube ID kept in one place.
- **Queue actions:** `PATCH /api/media/[id]` with `{action:
  "approve"|"remove"|"skip"|"top"}`, owner-only, run under `lockCreator`.
  Settings go through `PATCH /api/media` (validated).
- **Tip list:** a badge "ขอคลิป: <title>" on the tip row.

## Security / policy

- **CSP (`next.config.ts`), for all pages, one policy:**
  - `frame-src` adds `https://www.youtube-nocookie.com https://www.youtube.com`.
  - `script-src` adds `https://www.youtube.com https://s.ytimg.com`.
  - `img-src` adds `https://i.ytimg.com`.
  - The policy is still report-only until the planned flip.
- **Outbound fetch:** only to the fixed `https://www.youtube.com/oembed`, with
  an encoded `https://www.youtube.com/watch?v=<id>` built from the parsed
  11-char ID (never the raw fan URL). 4 s timeout.
- **Stored data:** only `videoId`, `title` (≤ 200 chars, censored with
  `censorText`) and `startSec` are stored. The fan's URL is never stored or
  echoed.
- **Rate limits:** preview `media-preview:<ip>` 20/min. Overlay `ended` posts
  are key-checked.
- **Terms:** add to the random/gimmicks section (renamed "ลูกเล่นจากแฟน"):
  copyright of requested clips is the creator's and the requester's
  responsibility, and the creator may skip anything. `lastUpdated` changes at
  deploy (founder).

## Out of scope (YAGNI)

- Spotify/TikTok links.
- Fan-side search.
- Per-clip price by length.
- Refunds for skipped clips. The fine print says the creator may skip.
- Volume per clip.

## Rulings (P6)

- **R6-1:** One `MediaRequest` table for both kinds now. Voice columns come
  in P7's migration block.
- **R6-2:** The server owns the queue and the overlay only reports `ended`.
  Multiple sources stay consistent, and dashboard skips work without sockets.
- **R6-3:** Confirmed clips survive the card being turned off. Rejection is
  the only cancel.
- **R6-4:** Test rows have no tip (`tipId` is nullable).
- **R6-5:** OBS size is 640×480.
- **R6-6:** No live-only rule. The queue simply waits while OBS is closed;
  the safety net handles a closed source mid-clip.

## Builder-check rulings (opus check, 2026-10-23) — these override the sections above

- **B1 oEmbed is a soft check.** Only 401/404 drop the clip ("คลิปนี้เล่นบนจอไลฟ์ไม่ได้"). Timeout/5xx keep it with title "คลิป YouTube". The fan text says clips "อาจเล่นไม่ได้" (age/region/Content-ID blocks only show at play time).
- **B2 Overlay errors.**
  - Post `error` (→ `PLAYED`, with `endedAt`) only for player errors 100/101/150.
  - Errors 2/5/153 and blocked autoplay are problems with this source: retry once, never post.
  - Watchdog: if the video hasn't reached PLAYING within 20 s of load, post `error`.
- **B3 Autoplay.** OBS autoplays with sound. In a normal browser tab, if the video is still unstarted 2 s after `playVideo()`, show a "คลิกเพื่อเปิดเสียง" button and post nothing.
- **B4 CSP.**
  - `script-src https://www.youtube.com`, `frame-src https://www.youtube-nocookie.com https://www.youtube.com`, `img-src https://i.ytimg.com`. No `connect-src` change.
  - Script and frame hosts go only in `OVERLAY_HEADERS` (and the frame host on the media dashboard page if it previews). `img-src` is added for all pages, since thumbnails show on the donate page.
  - Player: `host: "https://www.youtube-nocookie.com"`, `playerVars.origin = location.origin`.
- **B5 Referrer.** Never set `referrerpolicy="no-referrer"` on the player. The site's `strict-origin-when-cross-origin` sends only the origin, which satisfies YouTube (error 153) without leaking `?key=`.
- **B6 Auto-confirm failure.**
  - The catch in `POST /api/tips` also retries `mediaQueueConfirmTx` alone (lock Tip → User), the same way it retries the spin.
  - If that fails too, the response carries `mediaDropped`.
- **B7 Rejected after it started.**
  - Reject sets `CANCELLED` but keeps `startedAt`.
  - On re-confirm, a `CANCELLED` row with `startedAt` becomes `PLAYED`. Only rows with no `startedAt` re-enter the queue.
- **B8 Cascade.** `MediaRequest.tipId` FK `ON DELETE CASCADE`, like Spin.
- **B9 Promotion and locking.**
  - Fast path in the GET (no lock): return the `PLAYING` row.
  - Slow path (none playing, or one is overdue): `$transaction` + `lockCreator`, re-read, then a status-conditional `updateMany`.
  - Dashboard actions and the overlay's `ended`/`started` posts take the same lock and use conditional updates.
  - Media paths lock only the User row.
- **B10 Timing.**
  - Promotion sets `promotedAt`. The overlay posts `started` when the video first reaches PLAYING, which sets `startedAt` once.
  - Safety net: `(startedAt ?? promotedAt) + maxSec + 60 s`.
  - GET returns `elapsedSec`, so a late-opened or refreshed source seeks to `startSec + elapsed`.
  - `playerVars.end = startSec + maxSec`.
  - Spec's `overdue` takes the slack as a parameter (60 s).
- **B11 Extras.**
  - Floor = `extrasFloor(min, [sound, wheel, media])` on both client and server.
  - When the amount falls short, drop in this order: media, then spin, then sound.
  - The server checks cumulatively: sound, then wheel+sound, then media+both.
- **B12 What the form sends.**
  - Only `mediaVideoId` + `mediaStart`, never the URL. The server checks `^[\w-]{11}$` and clamps start to [0, 43200].
  - oEmbed runs in parallel with `verifySlip`.
  - `live/` links ignore `start`.
- **B13 Card off, pause and seen.**
  - Card off: a `PLAYING` row goes back to `APPROVED` at the top, with `startedAt`/`promotedAt` cleared.
  - Pause: the current clip finishes; nothing new starts.
  - `mediaSeenAt` drives a "เชื่อมต่อแล้ว" badge on the settings page, written at most every 30 s (like `touchComboSeen`), plus `touchOverlaySeen`.
- **B14 Server-side consent.** `PATCH /api/media` refuses `autoApprove: true` unless `mediaAutoAckAt` is set or the body has `ack: true` (which sets it). Same pattern as `wheelRulesAcceptedAt`.
- **B15 Test rows.**
  - `tipId IS NULL`; left out of badges and stats.
  - Position = min − 1; one test row at a time (it replaces the previous one).
  - The video is a fixed constant ID, validated by the same parser. No creator-chosen link (YAGNI).
- **B16 Registry and names.**
  - Extend the `FeatureId`, `toggleKind` and `obsPath` unions, `FeatureFlags.mediaEnabled`, and the `mediaToggle` branch in `/api/overlay/asset`.
  - "media" already means alert-set media, so name the server module `src/lib/media-queue.ts` and its helpers `mediaQueue*`.
  - The feature id stays `media` (URL `/dashboard/features/media`, OBS `/media`).
  - Pure rules stay in `src/lib/media.ts` (already written: `parseYouTube`, `parseStart`, `cleanMediaTitle`, `overdue`).
