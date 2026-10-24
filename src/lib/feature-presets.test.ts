import { test } from "node:test";
import assert from "node:assert/strict";
import { presetChanges, PRESETS, goalDefaults, DEFAULT_GOAL_TITLE, DEFAULT_GOAL_AMOUNT } from "./feature-presets.ts";

const off = { alertsEnabled: false, goalOverlayEnabled: false, timerEnabled: false };
const on = { alertsEnabled: true, goalOverlayEnabled: true, timerEnabled: true };

test("subathon switches on only what is off", () => {
  assert.deepEqual(
    presetChanges({ alertsEnabled: true, goalOverlayEnabled: false, timerEnabled: true }, "subathon"),
    { goalOverlayEnabled: true },
  );
});

test("presets never switch anything off", () => {
  assert.deepEqual(presetChanges(on, "basic"), {});
});

test("preset contents", () => {
  assert.deepEqual(presetChanges(off, "basic"), { alertsEnabled: true });
  assert.deepEqual(presetChanges(off, "goal"), { alertsEnabled: true, goalOverlayEnabled: true });
  assert.deepEqual(Object.keys(PRESETS), ["basic", "goal", "subathon"]);
});

test("turning the goal on fills a missing name and amount, never what the creator set", () => {
  assert.deepEqual(goalDefaults({ goalTitle: null, goalAmount: null }), { goalTitle: DEFAULT_GOAL_TITLE, goalAmount: DEFAULT_GOAL_AMOUNT });
  assert.deepEqual(goalDefaults({ goalTitle: "  ", goalAmount: 0 }), { goalTitle: DEFAULT_GOAL_TITLE, goalAmount: DEFAULT_GOAL_AMOUNT });
  assert.deepEqual(goalDefaults({ goalTitle: "ไมค์ใหม่", goalAmount: null }), { goalAmount: DEFAULT_GOAL_AMOUNT });
  assert.deepEqual(goalDefaults({ goalTitle: null, goalAmount: 10 }), { goalTitle: DEFAULT_GOAL_TITLE });
  assert.deepEqual(goalDefaults({ goalTitle: "ไมค์ใหม่", goalAmount: 500 }), {});
});
