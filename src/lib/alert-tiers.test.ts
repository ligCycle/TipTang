import { test } from "node:test";
import assert from "node:assert/strict";
import { pickTier, resolveAlert, normalizeTiers, type AlertTier } from "./alert-tiers.ts";

const tier = (minAmount: number, over: Partial<AlertTier> = {}): AlertTier => ({
  minAmount,
  soundUrl: null,
  imageUrl: null,
  videoUrl: null,
  durationSec: null,
  ...over,
});

test("pickTier: exact minimum picks that tier", () => {
  const t = [tier(100), tier(500)];
  assert.equal(pickTier(t, 500)?.minAmount, 500);
  assert.equal(pickTier(t, 499.99)?.minAmount, 100);
});

test("pickTier: below lowest tier returns null", () => {
  assert.equal(pickTier([tier(100), tier(500)], 99), null);
  assert.equal(pickTier([], 1000), null);
});

test("pickTier: order of the input does not matter", () => {
  assert.equal(pickTier([tier(500), tier(100)], 700)?.minAmount, 500);
});

const base = { soundUrl: "a.mp3", imageUrl: "a.png", videoUrl: null, durationSec: 7 };

test("resolveAlert: only overridden fields change", () => {
  const out = resolveAlert(base, tier(100, { soundUrl: "b.mp3" }), new Set(["b.mp3"]));
  assert.deepEqual(out, { soundUrl: "b.mp3", imageUrl: "a.png", videoUrl: null, durationSec: 7 });
});

test("resolveAlert: tier video replaces base image", () => {
  const out = resolveAlert(base, tier(100, { videoUrl: "v.mp4" }), new Set(["v.mp4"]));
  assert.equal(out.imageUrl, null);
  assert.equal(out.videoUrl, "v.mp4");
});

test("resolveAlert: tier duration overrides", () => {
  assert.equal(resolveAlert(base, tier(100, { durationSec: 15 }), new Set()).durationSec, 15);
});

test("resolveAlert: deleted library asset falls back", () => {
  const out = resolveAlert(base, tier(100, { soundUrl: "gone.mp3", imageUrl: "gone.png" }), new Set());
  assert.equal(out.soundUrl, "a.mp3");
  assert.equal(out.imageUrl, "a.png");
});

test("resolveAlert: no tier returns base", () => {
  assert.deepEqual(resolveAlert(base, null, new Set()), base);
});

test("normalizeTiers: rejects six tiers", () => {
  const six = [1, 2, 3, 4, 5, 6].map((n) => tier(n * 100));
  assert.deepEqual(normalizeTiers(six), { ok: false, error: "too_many" });
});

test("normalizeTiers: rejects 0 and 12.5", () => {
  assert.deepEqual(normalizeTiers([tier(0)]), { ok: false, error: "invalid" });
  assert.deepEqual(normalizeTiers([tier(12.5)]), { ok: false, error: "invalid" });
});

test("normalizeTiers: rejects durations outside 3-60", () => {
  assert.deepEqual(normalizeTiers([tier(100, { durationSec: 2 })]), { ok: false, error: "invalid" });
  assert.deepEqual(normalizeTiers([tier(100, { durationSec: 61 })]), { ok: false, error: "invalid" });
});

test("normalizeTiers: rejects two tiers at 100", () => {
  assert.deepEqual(normalizeTiers([tier(100), tier(100)]), { ok: false, error: "duplicate" });
});

test("normalizeTiers: rejects non-array and junk", () => {
  assert.deepEqual(normalizeTiers("x"), { ok: false, error: "invalid" });
  assert.deepEqual(normalizeTiers([{ minAmount: 100, soundUrl: 5 }]), { ok: false, error: "invalid" });
});

test("normalizeTiers: sorts ascending", () => {
  const r = normalizeTiers([tier(500), tier(100)]);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.tiers.map((t) => t.minAmount), [100, 500]);
});
