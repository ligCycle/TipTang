import { test } from "node:test";
import assert from "node:assert/strict";
import { topCountOf, topRangeOf, topSince } from "./top-board.ts";

test("range: known values pass, anything else is 30 days", () => {
  assert.equal(topRangeOf("today"), "today");
  assert.equal(topRangeOf("7d"), "7d");
  assert.equal(topRangeOf("all"), "all");
  assert.equal(topRangeOf("90d"), "30d");
  assert.equal(topRangeOf(null), "30d");
});

test("rows: 3, 5 or 10, anything else is 5", () => {
  assert.equal(topCountOf(3), 3);
  assert.equal(topCountOf("10"), 10);
  assert.equal(topCountOf(4), 5);
  assert.equal(topCountOf(undefined), 5);
});

test("all time counts every tip; today starts at Bangkok midnight", () => {
  // 2026-11-15 03:30 Bangkok = 2026-11-14 20:30 UTC.
  const now = new Date("2026-11-14T20:30:00Z");
  assert.equal(topSince("all", now), null);
  assert.equal(topSince("today", now)?.toISOString(), "2026-11-14T17:00:00.000Z");
});
