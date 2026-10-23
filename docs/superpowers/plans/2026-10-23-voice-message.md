# ฝากเสียง (voice message) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (founder chose inline + an opus reviewer per task). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fans record a voice message of up to 30 s with a tip. It joins the P6 media queue and plays on `/overlay/<u>/media`, after the creator approves it or straight away when auto-approve is on (behind its own warning).

**Architecture:**
- Pure rules live in `src/lib/media.ts`.
- Storage helpers live in `src/lib/storage.ts` (private bucket, `voices/` prefix).
- The queue in `src/lib/media-queue.ts` becomes kind-aware.
- The overlay branches into an `<audio>` player.
- Fans record in a new `VoiceRecorder` component, held in TipForm state.

**Tech Stack:** Next 16, React 19, Prisma 7, next-intl, MediaRecorder, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-23-voice-message-design.md`. The W1–W15 rulings at its end override earlier text.

## Global Constraints

- **Copy:** th/en parity, no emoji, gender-neutral copy.
- **Schema:** goes into the unapplied `20261018000000_feature_hub` migration. Run `db execute` locally with the dev server stopped (PGlite allows one connection).
- **Locks:** lock order is Tip → Wheel → User. Media paths lock User only.
- **Never block a tip:**
  - voice problems → `voiceDropped`;
  - the amount is never raised for the fan;
  - one fan media per tip (`media_both`).
- **Voice is private:**
  - files go only to the private bucket;
  - signed URLs go only to the key-checked overlay feed (current row) and the owner-checked listen route.
- **Never:** print overlay keys, use the production DB, or push.

## Review Focus

1. A creator with voice on and clips off still gets voices played (W5).
2. Every delete path removes the voice file (W9). Purge never leaves a playable row without a file (W8).
3. In an in-app browser, or with the mic denied, the fan can still tip (W4).
4. Continue pressed mid-recording neither loses the recording nor sends half of it (W12).
5. An over-size body (slip + voice) shows `tooLarge`, not a generic error (W11).

---

### Task 1: Rules + storage helpers

**Files:** `src/lib/media.ts`, `src/lib/media.test.ts`, `src/lib/filetype.ts` (+test if one exists), `src/lib/storage.ts`, `src/app/api/uploads/[...path]/route.ts`

**Produces:**
- `VOICE_MAX_SEC = 30`, `VOICE_MAX_BYTES = 1_000_000`, `VOICE_MIN_BYTES = 1024`, `VOICE_DEFAULT_MIN = 30`.
- `voiceBaseType(type: string): "audio/webm"|"audio/mp4"|"audio/ogg"|null` (strips parameters, lowercase).
- `clampVoiceSec(v: unknown): number` (1–30, default 30).
- `VOICE_EXT = {webm: "weba", mp4: "m4a", ogg: "ogg"}`.
- `filetype` `audio/mp4` check (`ftyp` at 4).
- `uploadVoice(file: File, baseType): Promise<string>` → `voices/<uuid>.<ext>` in the private bucket.
- `deleteVoices(keys: string[]): Promise<boolean>` (reuses `deleteSlipsBatch`).
- Uploads route: 404 when production; `weba`/`m4a` types.

- [ ] Write the tests:
  - `voiceBaseType` handles `audio/webm;codecs=opus`, `AUDIO/MP4`, `audio/ogg; codecs=opus`, `audio/mpeg` → null, `""` → null;
  - `clampVoiceSec("12.7")` → 13, 0 → 1, 99 → 30, junk → 30;
  - `bytesMatchType("audio/mp4", ftyp bytes)`.
- [ ] Run them and see them FAIL.
- [ ] Implement.
- [ ] Run them and see them PASS. Commit.

### Task 2: Schema, kind-aware queue, tip route, delete paths, purge

**Files:** `prisma/schema.prisma`, the migration, `src/lib/media-queue.ts`, `src/app/api/tips/route.ts`, `src/app/api/tips/[id]/route.ts`, `src/app/api/account/route.ts`, `src/app/api/cron/purge-slips/route.ts`, `src/lib/retention.ts` (if the cut-offs live there), `src/app/api/overlay/[username]/media/route.ts`, `src/app/api/media/[id]/audio/route.ts` (new)

**Schema:**
- `MediaRequest.videoId` becomes nullable.
- New fields: `audioKey?`, `durationSec Int?`, `audioPurgedAt?`.
- New index: `@@index([kind, audioPurgedAt])`.
- User gets `voiceEnabled false`, `voiceMinAmount 30`, `voiceAutoApprove false`, `voiceAutoAckAt?`.

**Queue (`media-queue.ts`):**
- `mediaQueueConfirmTx` reads consent per kind. A voice with `audioPurgedAt` set → REMOVED.
- `mediaQueueRejectTx` sets `endedAt`.
- `mediaQueueCurrent`:
  - is enabled when either card is on;
  - filters APPROVED rows by the kinds that are on;
  - uses the per-row overdue limit;
  - `MediaCurrent` gets `kind`, `maxSec`, `durationSec`, `audioUrl`, with signed URLs cached per id for 9 min.
- `requeuePlayingTx(tx, userId, kind)`.
- `setVoiceEnabled`.
- `mediaQueueAction(remove)` deletes the voice file at once.
- `mediaQueueTest(userId, now, kind)`: the voice test row uses `audioKey: null` and its URL is the static `/sounds/voice-test.wav` (decided in the feed via `tipId null && kind voice`).

**Tip route:**
- Reads `voice` and `voiceSec`.
- Validation order:
  1. size between `VOICE_MIN_BYTES` and `VOICE_MAX_BYTES`;
  2. `voiceBaseType`;
  3. magic bytes;
  4. `voiceEnabled`;
  5. floor `extrasFloor(min, [sound, spin, voiceMin])`.
- On success: `uploadVoice` after the slip upload, then nested create with kind voice.
- The P2002 catch and the create failure delete the voice file.
- The auto-confirm retry covers voice too.
- The response gets `voiceDropped`.

**Delete paths and purge:**
- The single and bulk tip deletes, and account deletion, collect `mediaRequest(s).audioKey` and delete the files.
- The purge cron adds voices:
  - final states (PLAYED/SKIPPED/REMOVED/CANCELLED) with `endedAt` older than 7 d;
  - `endedAt` null and `createdAt` older than 30 d (any state);
  - files deleted, `audioKey` set to null, `audioPurgedAt` set.
- Listen route: `GET /api/media/[id]/audio` is owner-only and answers with a 302 to a 60 s signed URL (local: `/api/uploads/...`).

- [ ] Schema + SQL. Fresh-DB `migrate deploy` + empty diff. `db execute` locally + `generate`.
- [ ] Implement.
- [ ] Verify through the routes. Tips with a synthesized webm voice:
  - accepted;
  - too small → dropped;
  - wrong magic → dropped;
  - voice card off → dropped;
  - both clip and voice → 400.
- [ ] Verify the lifecycle:
  - confirm → PENDING;
  - listen route 302 for the owner, 404 for another id;
  - approve → overlay feed has `audioUrl` and `kind` voice;
  - voice on with clips off → still handed out;
  - remove deletes the file;
  - tip delete deletes the file.
- [ ] Run the purge route with the cron secret only if it is in `.env.development.local`. Otherwise verify the query with a ledgered note.
- [ ] tsc, tests. Commit.

### Task 3: Overlay audio player + Permissions-Policy

**Files:** `src/components/overlay/MediaOverlayClient.tsx`, `next.config.ts`, `public/sounds/voice-test.wav` (generated by a script in the scratchpad)

**Player:**
- The clip branch is unchanged.
- The voice branch:
  - creates an `<audio>` element per id, with no seeking;
  - sets volume as volume/100;
  - `play()` reports `started` when it resolves;
  - `ended` and `error` are reported, plus a 30 s local timer;
  - a rejected `play()` (autoplay block) shows the click button in a browser tab and posts nothing;
  - the 20 s watchdog applies.
- Card: "ฝากเสียงจาก <fan> · ฿X" (test: "ทดสอบเสียง"), a mic icon, and a bar animated over `durationSec` with CSS.

**Headers:** split into `SECURITY_HEADERS_SITE` (`microphone=(self)`) and `SECURITY_HEADERS_OVERLAY` (`microphone=()`).

- [ ] Implement. Generate the WAV: a 2 s two-tone chime, 22.05 kHz mono 16-bit.
- [ ] Browser check in an iframe:
  - the voice test row plays (`started` reported);
  - `ended` moves the queue on;
  - a real tip voice plays from a signed or local URL;
  - the response headers show the microphone policy on the donate page and on the overlay.
- [ ] Commit.

### Task 4: Creator page + hub card

**Files:** `src/components/features/MediaPage.tsx`, `src/lib/feature-registry.ts`, `src/lib/feature-presets.ts`, `src/app/api/overlay/asset/route.ts`, `src/app/api/overlay/setup/route.ts`, `src/components/features/FeatureHub.tsx`, `src/app/api/media/route.ts`, messages

**Hub card:** `{id: "voice", icon: "mic", flag: "voiceEnabled", href: "/dashboard/features/media#voice", fanPage: true, toggleKind: "voiceToggle", obsPath: null, obsSize: ""}`. It shows "ใช้ลิงก์ OBS เดียวกับขอคลิป/เพลง" where the OBS row would be. Check that FeatureCard handles `obsPath: null` the way soundpick does.

**`PATCH /api/media`** gets `voiceEnabled`, `voiceMinAmount`, `voiceAutoApprove`, `voiceAck`, with the B14 pattern (409 `voice_ack_required`). `POST {action: "test", kind}`.

**Page:**
- a section `id="voice"` "④ ฝากเสียง" with on/off, minimum, auto-approve (its own 4-point warning dialog) and a test button;
- voice queue rows show a mic tile plus a "ฟัง" button (opens `/api/media/[id]/audio` in an `<audio>` element in the page);
- the header switch stays for clips.

- [ ] Implement.
- [ ] Browser check: the dialog gate works; "ฟัง" plays; the voice card toggles from the hub; the page shows no horizontal overflow at 402 px.
- [ ] Commit.

### Task 5: Donate page recorder + TipForm + badge + legal copy

**Files:** `src/components/VoiceRecorder.tsx` (new), `src/components/MediaPicker.tsx`, `src/components/TipForm.tsx`, `src/app/[locale]/[username]/page.tsx`, `src/components/TipList.tsx`, `src/components/TipRow.tsx`, messages (`profile.voice*`, `dashboard.voiceBadge`, `terms.randomBody`, the privacy section)

**`VoiceRecorder`** takes `{value: VoicePick|null, onChange, onUnsettled, maxSec}`, where `VoicePick = {blob, url, type, sec}`.
- States: idle, then recording (countdown, stop), then recorded (play/pause, re-record, delete).
- Errors: denied, no device, unsupported, plus the in-app browser notice with copy link and LINE `openExternalBrowser=1`.
- `track.stop()` after recording.
- Anything shorter than 1 s is discarded.

**MediaPicker** becomes a "สื่อจากแฟน" block: clip and voice as radio cards when both are on, otherwise the single one.

**TipForm:**
- holds the voice in state and appends `voice` + `voiceSec`;
- "unsettled" covers recording in progress (continue stops the recording and waits);
- checks size (slip + voice ≤ 4.2 MB, else `tooLarge`);
- maps a non-JSON 413 to `tooLarge`;
- shows the `voiceDropped` note;
- `reset()` revokes the blob URL;
- the voice price takes the "media" slot.

**Donate page:** a `voiceChoice` prop.

**Badge:** "ฝากเสียง <n> วิ", hidden for REMOVED/CANCELLED.

**Legal copy:**
- terms bullet: the creator is responsible for what plays; files are deleted after 7 days;
- privacy line: voice recordings, why, and how long they are kept.

- [ ] Implement.
- [ ] Browser check at 375 px:
  - record with the pane's microphone, or a fake stream if permission is unavailable. If the pane has no mic, verify the error path and drive the upload with a synthesized blob;
  - the radio switch between clip and voice clears the other;
  - the floor locks the option;
  - continue mid-recording;
  - the done screen notes.
- [ ] Commit.

### Task 6: Final pass

- [ ] `npm test`, tsc, build, lint (baseline), parity, fresh-DB migrate + empty diff.
- [ ] Full flow: record → tip → confirm → listen → approve → overlay plays → history; remove deletes the file.
- [ ] Opus whole-project review, then one fix pass.
- [ ] Copy rulings to the memory log and delete the workspace.
