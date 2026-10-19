import { test } from "node:test";
import assert from "node:assert/strict";
import {
  poolsForAmount,
  validatePick,
  applyPick,
  cleanName,
  cleanPrice,
  libraryNumber,
  MAX_NAME,
  type NormalMedia,
  type PickCandidate,
} from "./alert-sets.ts";

const media: NormalMedia = {
  sounds: [
    { url: "a", minAmount: 0 },
    { url: "b", minAmount: 50 },
    { url: "c", minAmount: 100 },
  ],
  images: ["i1"],
  videos: ["v1"],
};

test("poolsForAmount: keeps sounds at or below the amount", () => {
  assert.deepEqual(poolsForAmount(media, 50), { sounds: ["a", "b"], images: ["i1"], videos: ["v1"] });
  assert.deepEqual(poolsForAmount(media, 20).sounds, ["a"]);
});

test("poolsForAmount: all sounds priced above → no sounds", () => {
  assert.deepEqual(poolsForAmount({ sounds: [{ url: "c", minAmount: 100 }], images: [], videos: [] }, 10).sounds, []);
});

const items: PickCandidate[] = [
  { assetId: "free", kind: "SOUND", fanPickable: true, minAmount: 0 },
  { assetId: "fifty", kind: "SOUND", fanPickable: true, minAmount: 50 },
  { assetId: "hidden", kind: "SOUND", fanPickable: false, minAmount: 0 },
  { assetId: "img", kind: "STICKER", fanPickable: true, minAmount: 0 },
];

test("validatePick: free sound, any amount ≥ creator minimum", () => {
  assert.deepEqual(validatePick(items, "free", 20, 20), { ok: true, assetId: "free" });
});

test("validatePick: creator minimum raises a free sound's floor", () => {
  assert.deepEqual(validatePick(items, "free", 20, 30), { ok: false, reason: "too_low" });
});

test("validatePick: below the sound minimum", () => {
  assert.deepEqual(validatePick(items, "fifty", 49, 1), { ok: false, reason: "too_low" });
  assert.deepEqual(validatePick(items, "fifty", 50, 1), { ok: true, assetId: "fifty" });
});

test("validatePick: not in set / not pickable / not a sound", () => {
  assert.deepEqual(validatePick(items, "other", 100, 1), { ok: false, reason: "unavailable" });
  assert.deepEqual(validatePick(items, "hidden", 100, 1), { ok: false, reason: "unavailable" });
  assert.deepEqual(validatePick(items, "img", 100, 1), { ok: false, reason: "unavailable" });
});

test("validatePick: null pick", () => {
  assert.deepEqual(validatePick(items, null, 100, 1), { ok: false, reason: "none" });
  assert.deepEqual(validatePick(items, "", 100, 1), { ok: false, reason: "none" });
});

test("applyPick: pick overrides tier/set sound", () => {
  const out = applyPick({ soundUrl: "tier.mp3", imageUrl: "i", videoUrl: null }, "fan.mp3");
  assert.equal(out.soundUrl, "fan.mp3");
  assert.equal(out.videoMuted, false);
});

test("applyPick: pick over a video mutes the video", () => {
  const out = applyPick({ soundUrl: null, imageUrl: null, videoUrl: "v.mp4" }, "fan.mp3");
  assert.equal(out.soundUrl, "fan.mp3");
  assert.equal(out.videoUrl, "v.mp4");
  assert.equal(out.videoMuted, true);
});

test("applyPick: no pick keeps sound and video unmuted", () => {
  const out = applyPick({ soundUrl: "s.mp3", imageUrl: null, videoUrl: "v.mp4" }, null);
  assert.equal(out.soundUrl, "s.mp3");
  assert.equal(out.videoMuted, false);
});

test("cleanName: trims, rejects empty and too long", () => {
  assert.equal(cleanName("  ab "), "ab");
  assert.equal(cleanName(""), null);
  assert.equal(cleanName("x".repeat(MAX_NAME + 1)), null);
  assert.equal(cleanName(5), null);
});

test("cleanPrice: whole baht 0..100000", () => {
  assert.equal(cleanPrice("50"), 50);
  assert.equal(cleanPrice(0), 0);
  assert.equal(cleanPrice(1.5), null);
  assert.equal(cleanPrice(-1), null);
  assert.equal(cleanPrice(100001), null);
  assert.equal(cleanPrice("abc"), null);
});

test("libraryNumber: unnamed sounds are numbered by whole-library order, everywhere", () => {
  const sounds = ["s1", "s2", "s3"]; // the creator's sounds, oldest first
  // A set (or the donate page) showing only s2 and s3 still calls them 2 and 3.
  assert.equal(libraryNumber(sounds, "s2"), 2);
  assert.equal(libraryNumber(sounds, "s3"), 3);
  assert.equal(libraryNumber(sounds, "gone"), 0);
});
