# ฝากเสียง (fan voice message) — design

Project 7 of the "เพิ่มลูกเล่นการโดเนท" roadmap. The master plan
(`C:\Users\ggtan\.claude\plans\1-2-drifting-lemur.md`) was approved 2026-10-23.

Founder decisions:
- Voice only, recorded in the browser.
- Moderation works the same as clips: a queue with creator approval, plus an auto-approve switch with a warning.

Calls marked *ruling* are mine (founder: "ตัดสินเอง จดไว้ รายงานตอนจบ"). This spec builds on P6 (`2026-10-23-media-request-design.md` and rulings B1–B16): same queue, same `/media` OBS link (R6), one fan media per tip (R1).

## Fan side (donate page)

- **The "สื่อจากแฟน" block** gets a second choice, "ฝากเสียง".
  - Clip and voice are radio-exclusive (R1): picking one clears the other.
  - The server refuses a tip that carries both (`media_both`, already built).
- **Recorder** (`VoiceRecorder`), built on MediaRecorder:
  - Format: the first of `audio/webm;codecs=opus`, `audio/mp4`, `audio/ogg;codecs=opus` that `MediaRecorder.isTypeSupported` accepts (R2).
  - Bitrate: `audioBitsPerSecond: 64000`.
  - Length: up to 30 s, with automatic stop at 30 s and a countdown.
  - Before sending, the fan can listen back (blob URL), record again, or delete.
  - Recordings under 1 s are discarded.
  - Errors handled: microphone denied, no microphone, or recorder unsupported ("เบราว์เซอร์นี้อัดเสียงไม่ได้"). The tip still works without voice.
- **Price:** the creator's `voiceMinAmount` (default ฿30) adds to the other extras through `extrasFloor`, using the drop order from B11. Media drops first, and voice counts as "media" there.
- **Fine print:**
  - "สูงสุด 30 วินาที"
  - "ครีเอเตอร์ฟังก่อนเล่น (หรือเปิดเล่นอัตโนมัติ)"
  - "ไฟล์เสียงถูกลบหลังเล่น 7 วัน"
- **Upload:** TipForm sends the file as `voice` in the same FormData as the slip.

## Server (`POST /api/tips`)

- **Validation:**
  - The `voice` File must be ≤ 1 MB.
  - Its declared type, with parameters stripped, must be in `audio/webm` | `audio/mp4` | `audio/ogg`.
  - Its magic bytes must match through `bytesMatchType`. Add `audio/mp4` (`ftyp` at offset 4).
  - The voice card must be on.
  - The amount must cover the cumulative floor (sound, then wheel, then voice).
  - Any failure → `voiceDropped` (the tip still goes through). The `media_both` check stays a 400.
- **Storage:**
  - `uploadVoice(file)` writes `voices/<uuid>.<ext>` into the PRIVATE slip bucket (`SLIP_BUCKET`), with the same driver split as slips.
  - It runs after the slip upload. If the tip row fails, both files are deleted.
- **Row:** a `MediaRequest` with `kind: "voice"`, `videoId: null`, `title: "ฝากเสียง"`, `audioKey` and `durationSec`.
  - `durationSec` comes from the client (`voiceSec`), clamped to 1–30. It is display only. The real cap is the player's 30 s limit.
- **Lifecycle:** HELD → … exactly as for clips (P6 pipeline). Auto-approve for voice uses `voiceAutoApprove` + `voiceAutoAckAt`, checked at confirm time like B14.
- *Ruling V1:* **Vercel request limit.** Requests are limited to about 4.5 MB, so the voice cap is 1 MB. At 64 kbps, 30 s is about 240 KB. The slip cap of 5 MB already exceeds the limit, so that problem pre-dates this project and is noted as a minor.

## Schema (folded into the unapplied feature_hub migration)

- **`MediaRequest`:**
  - `videoId` becomes nullable.
  - New `audioKey String?`, `durationSec Int?` and `audioPurgedAt DateTime?`.
- **User:** `voiceEnabled false`, `voiceMinAmount 30`, `voiceAutoApprove false`, `voiceAutoAckAt?`.
  - Volume, pause and colour are shared with clips (one queue, one link).

## Playing (`/overlay/<u>/media`)

- **Feed:** the GET adds `kind`. For a voice it also returns a fresh `audioUrl`: `signedSlipUrl(audioKey, 600)` in production, `/api/uploads/...` locally.
  - The URL is only handed to the key-checked overlay feed, and only for the clip playing now.
- **Player:**
  - Voice plays in an `<audio>` element at the shared volume, with no YouTube involved.
  - It reports `started`, `ended` and `error` (an audio error → `error`).
  - A refresh seeks to the elapsed time.
  - The 20 s watchdog still applies.
- **On-stream card:** "ฝากเสียงจาก <fan> · ฿<amount>", plus a simple animated bar showing playback.
- **Safety net:** maxSec for voice is fixed at 30 (`overdue(…, 30)`).
- **CSP:** `media-src` already allows `https://*.supabase.co` and `blob:`. Nothing new needed.

## Creator side

- **Hub card "ฝากเสียง"** (`voice`):
  - icon `mic`;
  - fanPage tag;
  - `obsPath: "/media"` (the same link);
  - `href: "/dashboard/features/media#voice"`;
  - toggle kind `voiceToggle`.
- **Media page:**
  - A new section "ฝากเสียง" with on/off, minimum, and auto-approve. Auto-approve has its own warning (inappropriate or offensive audio, personal data, the creator is responsible, skip anytime), and its ack is stored in `voiceAutoAckAt`.
  - Queue rows for voice show a mic icon instead of a thumbnail, plus a **"ฟัง"** button. The creator must be able to listen before approving.
  - The button calls `GET /api/media/[id]/audio` (owner-checked), which redirects to or returns a 60 s signed URL.
- **Tip row badge:** "ฝากเสียง <n> วิ".

## Retention / privacy

- **Purge rules:** the daily `purge-slips` cron also deletes voice files:
  - 7 days after the row reached a final state (PLAYED, SKIPPED, REMOVED, CANCELLED), counted from `endedAt ?? createdAt`;
  - any voice older than 30 days, whatever its state.
  - Purging sets `audioPurgedAt` and clears `audioKey`.
- **Tip deleted:** the cascade deletes the row, so the tip-deletion paths must also delete the voice file. This is handled where slips are deleted.
- **Permissions-Policy:** `microphone=()` becomes `microphone=(self)` on non-overlay pages (*ruling V2*). Only same-origin pages can ask, and the browser still prompts. Overlay pages keep `microphone=()`.
- **Terms and privacy:** the terms page gets a bullet for voice messages: what is stored, the 7-day rule, and that the creator is responsible for what plays. The privacy page lists voice recordings as data the fan sends, with the retention rule. `lastUpdated` stays untouched until deploy.

## Rulings (P7)

- **V1:** voice cap is 1 MB at 64 kbps (fits under Vercel's body limit).
- **V2:** `microphone=(self)` on all non-overlay pages rather than only the donate page. The Next headers matcher can't single out `/:locale/:username` cleanly.
- **V3:** voice shares the queue, link, volume, pause and colour with clips. Its own switch, minimum and auto-approve are kept separate, because consent differs (copyright for clips, inappropriate audio for voice).
- **V4:** the duration from the client is for display only. The player enforces 30 s.
- **V5:** the creator listens through a short-lived signed URL. Nothing about voice is public.


## Builder-check rulings (opus check, 2026-10-23). These override the sections above.

- **W1. Codec parameters in the type.**
  - Strip `;codecs=…` once into `baseType`, then validate with `bytesMatchType(baseType, head)`.
  - `uploadVoice(file, baseType)` picks the extension from a voice map: webm→`weba`, mp4→`m4a`, ogg→`ogg`. It uploads with `contentType: baseType`.
  - The local uploads route gets `weba`/`m4a`.
- **W2. Formats.** Keep the R2 order. If no type passes `isTypeSupported`, fall back to `new MediaRecorder(stream)` with no options and use `recorder.mimeType`. Check an iPhone recording in OBS before launch (deploy checklist).
- **W3. No seeking for voice.**
  - Chrome webm has no duration or cues.
  - A refreshed source restarts the voice from 0. It is at most 30 s, and the server's slack covers it.
  - A local 30 s timer ends playback.
  - The bar is driven by `durationSec` from the feed.
- **W4. In-app browsers.**
  - Feature check: `navigator.mediaDevices?.getUserMedia && window.MediaRecorder`.
  - On failure, if the user agent matches `Line/|FBAN|FBAV|Instagram|musical_ly|BytedanceWebview`, show "เปิดใน Chrome/Safari เพื่ออัดเสียง" with a copy-link button. LINE also gets an `openExternalBrowser=1` link.
  - Always `track.stop()` after recording.
- **W5. Per-kind queue.**
  - The feed is on when `mediaEnabled || voiceEnabled`.
  - Only APPROVED rows whose own card is on are handed out.
  - The overdue limit is per row: voice 30 s, clip `mediaMaxSec`.
  - Confirm reads the voice consent fields for voice rows.
  - Turning one card off requeues only that kind.
  - `ROW_SELECT` gets `kind` and `audioKey`.
- **W6. Overlay.**
  - `MediaCurrent` gets `kind`, `maxSec`, `durationSec` and `audioUrl`.
  - The `<audio>` element is created once per id, and `src` is never bound to each poll.
  - The feed signs a URL only for the playing voice row, cached per id in memory for 9 min of a 10-min URL, so polls don't sign every time.
  - The click-for-sound logic is reused.
  - Audio loads through `<audio src>` only.
- **W7. Nullable videoId ripple.**
  - Types become kind-aware.
  - The tips-route retry runs for a clip or a voice.
  - The response carries `voiceDropped`, and TipForm shows it.
- **W8. Purged voice re-confirmed.**
  - A voice with `audioPurgedAt` set goes to REMOVED on confirm.
  - The purge cut-off is `endedAt < cut`, or `endedAt null AND createdAt < cut`.
  - Reject sets `endedAt` too, so CANCELLED rows age from the reject.
- **W9. Delete paths.**
  - Account deletion, both tip delete paths and the P2002 catch also delete voice files.
  - A creator "remove" deletes the file at once and sets `audioPurgedAt`.
- **W10. Supabase bucket MIME.** Pre-deploy check that the `slips` bucket allows `audio/*` (deploy checklist).
- **W11. Body size.**
  - The client refuses `slip.size + voice.size > 4.2 MB` with `tooLarge`.
  - TipForm maps a non-JSON 413 to `tooLarge`.
- **W12. TipForm state.**
  - The recording lives in TipForm state (survives the pay step).
  - Continue mid-recording stops the recording and waits for `onstop` (unsettled pattern).
  - `reset()` revokes the blob URL.
  - The voice price uses the "media" slot in `mediaExtrasDrop`.
  - A separate `voiceChoice` prop. The clip/voice radio shows only when both cards are on.
  - Server floor: `extrasFloor(min, [sound, spin, voiceMinAmount])`.
- **W13. Local uploads route.** Returns 404 when `NODE_ENV === "production"`.
- **W14. Permissions-Policy.**
  - `SECURITY_HEADERS` splits into a site version (`microphone=(self)`) and an overlay version (`microphone=()`).
- **W15. Remaining items.**
  - **Test sound:** a synthesized 2 s chime, `public/sounds/voice-test.wav`, generated in code with no download. The voice card's test button adds a `kind: "voice"` test row that plays it from that static URL.
  - **Hub card:** the voice card has `obsPath: null` and says "ใช้ลิงก์ OBS เดียวกับขอคลิป/เพลง".
  - **Wiring:** the voice toggle goes through `/api/overlay/asset` `voiceToggle` and `FeatureFlags.voiceEnabled`.
  - **Fan notice:** a line by the record button: "เสียงนี้จะถูกเล่นออกไลฟ์".
  - **Purge index:** `@@index([kind, audioPurgedAt])`.
  - **Minimum size:** the server refuses files under 1 KB (`voiceDropped`).
