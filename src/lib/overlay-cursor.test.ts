import { test } from "node:test";
import assert from "node:assert/strict";
import { nextCursor } from "./overlay-cursor.ts";

const T1 = "2026-10-18T10:00:01.000Z";
const T3 = "2026-10-18T10:00:03.000Z";
const T5 = "2026-10-18T10:00:05.000Z";
const T9 = "2026-10-18T10:00:09.000Z";

test("advances to the latest tip", () => {
  assert.equal(nextCursor(T1, [T3], T9, true), T3);
});

test("alerts off: jumps to server time so the backlog never replays", () => {
  assert.equal(nextCursor(T1, [], T9, false), T9);
});

test("never moves backwards and ignores null times", () => {
  assert.equal(nextCursor(T5, [T3, null], T9, true), T5);
});
