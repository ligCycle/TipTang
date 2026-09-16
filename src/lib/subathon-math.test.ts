import { test } from "node:test";
import assert from "node:assert/strict";
import { nextTimerState, tipSeconds, type TimerConfig } from "./subathon-math.ts";

// Add: 10 baht = 60 s. Reduce: 20 baht = 60 s (twice the price). Floor 5 min,
// cap 2 h.
const cfg: TimerConfig = {
  bahtPerUnit: 10,
  secondsPerUnit: 60,
  maxSeconds: 7200,
  reduceBahtPerUnit: 20,
  reduceSecondsPerUnit: 60,
  floorSeconds: 300,
};
const now = 1_000_000_000_000; // arbitrary fixed instant (ms)

test("tipSeconds scales by the rate and rounds to whole seconds", () => {
  assert.equal(tipSeconds(10, 10, 60), 60);
  assert.equal(tipSeconds(25, 20, 60), 75);
  assert.equal(tipSeconds(1, 3, 10), 3); // 3.33 → 3
  assert.equal(tipSeconds(5, 0, 60), 0); // nonsense rate → nothing
});

test("add while running extends endsAt", () => {
  const s = nextTimerState({ endsAtMs: now + 600_000, remaining: null }, cfg, 10, false, now);
  assert.deepEqual(s, { endsAtMs: now + 660_000, remaining: null });
});

test("add while running is capped at now + max", () => {
  const s = nextTimerState({ endsAtMs: now + 7_100_000, remaining: null }, cfg, 100, false, now);
  assert.deepEqual(s, { endsAtMs: now + 7_200_000, remaining: null });
});

test("add while paused banks seconds, capped", () => {
  assert.deepEqual(nextTimerState({ endsAtMs: null, remaining: 100 }, cfg, 10, false, now), {
    endsAtMs: null,
    remaining: 160,
  });
  assert.deepEqual(nextTimerState({ endsAtMs: null, remaining: 7190 }, cfg, 10, false, now), {
    endsAtMs: null,
    remaining: 7200,
  });
});

test("reduce while running subtracts at the reduce rate", () => {
  // 40 baht → 120 s off
  const s = nextTimerState({ endsAtMs: now + 600_000, remaining: null }, cfg, 40, true, now);
  assert.deepEqual(s, { endsAtMs: now + 480_000, remaining: null });
});

test("reduce never goes below the floor (running and paused)", () => {
  // 6 min left, 100 baht would take 5 min → clamps to floor (5 min)
  assert.deepEqual(nextTimerState({ endsAtMs: now + 360_000, remaining: null }, cfg, 100, true, now), {
    endsAtMs: now + 300_000,
    remaining: null,
  });
  assert.deepEqual(nextTimerState({ endsAtMs: null, remaining: 360 }, cfg, 100, true, now), {
    endsAtMs: null,
    remaining: 300,
  });
});

test("reduce is a no-op when already at or below the floor", () => {
  assert.equal(nextTimerState({ endsAtMs: now + 300_000, remaining: null }, cfg, 100, true, now), null);
  assert.equal(nextTimerState({ endsAtMs: now + 120_000, remaining: null }, cfg, 100, true, now), null);
  assert.equal(nextTimerState({ endsAtMs: null, remaining: 200 }, cfg, 100, true, now), null);
});

test("add is NOT blocked by the floor — the tug-of-war still works", () => {
  const s = nextTimerState({ endsAtMs: now + 120_000, remaining: null }, cfg, 10, false, now);
  assert.deepEqual(s, { endsAtMs: now + 180_000, remaining: null });
});

test("no change when the timer is stopped or already expired", () => {
  assert.equal(nextTimerState({ endsAtMs: null, remaining: null }, cfg, 10, false, now), null);
  assert.equal(nextTimerState({ endsAtMs: now - 1000, remaining: null }, cfg, 10, false, now), null);
  assert.equal(nextTimerState({ endsAtMs: now - 1000, remaining: null }, cfg, 100, true, now), null);
});

test("no change when the amount is too small to move the clock", () => {
  assert.equal(nextTimerState({ endsAtMs: now + 600_000, remaining: null }, cfg, 0.01, false, now), null);
});

test("no max → add is unbounded", () => {
  const open = { ...cfg, maxSeconds: null };
  const s = nextTimerState({ endsAtMs: now + 7_100_000, remaining: null }, open, 1000, false, now);
  assert.deepEqual(s, { endsAtMs: now + 7_100_000 + 6_000_000, remaining: null });
});

test("results are whole seconds", () => {
  const s = nextTimerState({ endsAtMs: now + 600_500, remaining: null }, cfg, 1, false, now);
  assert.equal(s && s.endsAtMs! % 1000, 0);
});
