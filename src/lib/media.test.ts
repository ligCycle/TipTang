import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseYouTube,
  parseStart,
  cleanMediaTitle,
  MEDIA_MAX_SEC_CHOICES,
  isMaxSec,
  overdue,
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

test("overdue: a playing clip past maxSec + 30 s counts as played", () => {
  const start = new Date("2026-10-23T10:00:00Z");
  assert.equal(overdue(start, 180, new Date("2026-10-23T10:03:29Z")), false);
  assert.equal(overdue(start, 180, new Date("2026-10-23T10:03:31Z")), true);
  assert.equal(overdue(null, 180, new Date()), false);
});
