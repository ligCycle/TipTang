import { test } from "node:test";
import assert from "node:assert/strict";
import { linkStatus } from "./obs-status.ts";

const NOW = Date.parse("2026-10-24T10:00:00Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

test("live within 2 minutes, seen before that, never without any time", () => {
  assert.equal(linkStatus([ago(30)], NOW).state, "live");
  assert.equal(linkStatus([ago(600)], NOW).state, "seen");
  assert.equal(linkStatus([null], NOW).state, "never");
});

test("final review I2: an alert link loaded before the update counts as placed (never live)", () => {
  assert.equal(linkStatus([null], NOW, ago(30)).state, "seen");
  assert.equal(linkStatus([null], NOW, ago(86_400)).state, "seen");
  assert.equal(linkStatus([ago(30)], NOW, ago(86_400)).state, "live");
});
