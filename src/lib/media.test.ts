import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseYouTube,
  parseStart,
  cleanMediaTitle,
  MEDIA_MAX_SEC_CHOICES,
  isMaxSec,
  overdue,
  mediaExtrasDrop,
  isVideoId,
  elapsedSec,
  TEST_VIDEO_ID,
  voiceBaseType,
  clampVoiceSec,
  VOICE_EXT,
  VOICE_MAX_SEC,
  VOICE_MAX_BYTES,
  VOICE_MIN_BYTES,
} from "./media.ts";

const ID = "dQw4w9WgXcQ";

test("parseYouTube accepts every common link shape", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL123`,
    `http://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `youtu.be/${ID}`,
    `  https://youtu.be/${ID}  `,
  ]) {
    assert.deepEqual(parseYouTube(url), { videoId: ID, startSec: 0 }, url);
  }
});

test("parseYouTube keeps the start time", () => {
  assert.equal(parseYouTube(`https://youtu.be/${ID}?t=90`)?.startSec, 90);
  assert.equal(parseYouTube(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)?.startSec, 90);
  assert.equal(parseYouTube(`https://www.youtube.com/embed/${ID}?start=45`)?.startSec, 45);
  assert.equal(parseYouTube(`https://www.youtube.com/watch?v=${ID}#t=2m`)?.startSec, 120);
});

test("parseYouTube rejects anything that isn't a YouTube video", () => {
  for (const url of [
    "",
    "hello",
    `https://evil.com/watch?v=${ID}`,
    `https://youtube.com.evil.com/watch?v=${ID}`,
    `https://notyoutube.com/watch?v=${ID}`,
    "https://www.youtube.com/watch?v=short",
    `https://www.youtube.com/watch?v=${ID}x`,
    "https://www.youtube.com/@channel",
    "https://www.youtube.com/playlist?list=PL123",
    `javascript:alert(1)//youtu.be/${ID}`,
    `ftp://youtu.be/${ID}`,
    `https://youtu.be/${ID}/extra`,
    "x".repeat(600),
  ]) {
    assert.equal(parseYouTube(url), null, url);
  }
  assert.equal(parseYouTube(null), null);
  assert.equal(parseYouTube(42), null);
});

test("parseStart reads seconds and h/m/s forms, caps and ignores junk", () => {
  assert.equal(parseStart("75"), 75);
  assert.equal(parseStart("1h2m3s"), 3723);
  assert.equal(parseStart("2m"), 120);
  assert.equal(parseStart("10s"), 10);
  assert.equal(parseStart(""), 0);
  assert.equal(parseStart(null), 0);
  assert.equal(parseStart("abc"), 0);
  assert.equal(parseStart("-5"), 0);
  assert.equal(parseStart("99999999"), 43_200);
});

test("cleanMediaTitle trims, collapses whitespace and caps at 200", () => {
  assert.equal(cleanMediaTitle("  a \n b  "), "a b");
  assert.equal(cleanMediaTitle("x".repeat(250)).length, 200);
  assert.equal(cleanMediaTitle(null), "");
});

test("max length choices", () => {
  assert.deepEqual([...MEDIA_MAX_SEC_CHOICES], [60, 120, 180, 300, 600]);
  assert.ok(isMaxSec(180));
  assert.ok(!isMaxSec(181));
  assert.ok(!isMaxSec("180"));
});

test("overdue: a playing clip past maxSec + slack counts as played", () => {
  const start = new Date("2026-10-23T10:00:00Z");
  assert.equal(overdue(start, 180, new Date("2026-10-23T10:03:59Z")), false);
  assert.equal(overdue(start, 180, new Date("2026-10-23T10:04:01Z")), true);
  assert.equal(overdue(start, 180, new Date("2026-10-23T10:03:31Z"), 30), true);
  assert.equal(overdue(null, 180, new Date()), false);
});

test("mediaExtrasDrop drops the clip first, then the wheel, then the sound", () => {
  const prices = { sound: 30, wheel: 40, media: 50 };
  assert.deepEqual(mediaExtrasDrop(120, 20, prices), []);
  assert.deepEqual(mediaExtrasDrop(100, 20, prices), ["media"]);
  assert.deepEqual(mediaExtrasDrop(60, 20, prices), ["media", "wheel"]);
  assert.deepEqual(mediaExtrasDrop(10, 20, prices), ["media", "wheel", "sound"]);
  assert.deepEqual(mediaExtrasDrop(10, 20, { sound: null, wheel: null, media: null }), []);
  assert.deepEqual(mediaExtrasDrop(45, 20, { sound: null, wheel: 40, media: null }), []);
  assert.deepEqual(mediaExtrasDrop(45, 20, { sound: null, wheel: 40, media: 10 }), ["media"]);
});

test("isVideoId and the test clip", () => {
  assert.ok(isVideoId("dQw4w9WgXcQ"));
  assert.ok(!isVideoId("dQw4w9WgXc"));
  assert.ok(!isVideoId("dQw4w9WgXc!"));
  assert.ok(!isVideoId(null));
  assert.ok(isVideoId(TEST_VIDEO_ID));
});

test("elapsedSec counts whole seconds since the start, never negative", () => {
  const s0 = new Date("2026-10-23T10:00:00Z");
  assert.equal(elapsedSec(s0, new Date("2026-10-23T10:00:42.900Z")), 42);
  assert.equal(elapsedSec(s0, new Date("2026-10-23T09:59:00Z")), 0);
  assert.equal(elapsedSec(null, new Date()), 0);
});

test("task 1 review: live links ignore start; odd hosts; huge start caps", () => {
  assert.deepEqual(parseYouTube(`https://www.youtube.com/live/${ID}?t=90`), { videoId: ID, startSec: 0 });
  assert.deepEqual(parseYouTube(`https://YOUTUBE.COM/watch?v=${ID}`), { videoId: ID, startSec: 0 });
  assert.equal(parseYouTube(`https://evil.com@youtu.be/${ID}`), null);
  assert.equal(parseYouTube(`https://xn--yutube-wqf.com/watch?v=${ID}`), null);
  assert.equal(parseStart("9".repeat(400)), 43_200);
});

test("cleanMediaTitle strips bidi/control characters and never splits a pair", () => {
  assert.equal(cleanMediaTitle("abc\u202Eevil\u200B\u0007x"), "abcevilx");
  const t = cleanMediaTitle("a".repeat(199) + "😀😀");
  assert.ok(!/[\uD800-\uDBFF]$/.test(t));
  assert.ok(t.length <= 200);
});

test("voiceBaseType strips codec parameters and keeps only recorder formats", () => {
  assert.equal(voiceBaseType("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(voiceBaseType("AUDIO/MP4"), "audio/mp4");
  assert.equal(voiceBaseType("audio/ogg; codecs=opus"), "audio/ogg");
  assert.equal(voiceBaseType("audio/mpeg"), null);
  assert.equal(voiceBaseType("video/webm"), null);
  assert.equal(voiceBaseType(""), null);
});

test("clampVoiceSec rounds into 1–30 and defaults to 30", () => {
  assert.equal(clampVoiceSec("12.7"), 13);
  assert.equal(clampVoiceSec(0), 1);
  assert.equal(clampVoiceSec(99), 30);
  assert.equal(clampVoiceSec("junk"), 30);
  assert.equal(clampVoiceSec(null), 30);
});

test("voice limits and file extensions", () => {
  assert.equal(VOICE_MAX_SEC, 30);
  assert.equal(VOICE_MAX_BYTES, 1_000_000);
  assert.equal(VOICE_MIN_BYTES, 1024);
  assert.deepEqual(VOICE_EXT, { "audio/webm": "weba", "audio/mp4": "m4a", "audio/ogg": "ogg" });
});
