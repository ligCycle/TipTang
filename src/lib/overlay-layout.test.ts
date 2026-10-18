import { test } from "node:test";
import assert from "node:assert/strict";
import { ANCHORS, isAnchor, DEFAULT_POSITIONS, anchorClasses, sharedAnchors } from "./overlay-layout.ts";

test("isAnchor accepts the 9 anchors only", () => {
  for (const a of ANCHORS) assert.ok(isAnchor(a));
  assert.equal(ANCHORS.length, 9);
  assert.equal(isAnchor("middle"), false);
  assert.equal(isAnchor(null), false);
});

test("default positions", () => {
  assert.deepEqual(DEFAULT_POSITIONS, { alert: "center", goal: "bottom-center", timer: "top-right" });
});

test("anchorClasses is distinct per anchor", () => {
  assert.equal(new Set(ANCHORS.map(anchorClasses)).size, 9);
});

test("sharedAnchors groups enabled features on one anchor", () => {
  const all = { alert: true, goal: true, timer: true };
  assert.deepEqual(sharedAnchors({ alert: "center", goal: "center", timer: "top-right" }, all), [["alert", "goal"]]);
  assert.deepEqual(sharedAnchors({ alert: "center", goal: "center", timer: "top-right" }, { ...all, goal: false }), []);
});
