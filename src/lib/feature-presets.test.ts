import { test } from "node:test";
import assert from "node:assert/strict";
import { presetChanges, PRESETS } from "./feature-presets.ts";

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
