import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bangkokDayKey,
  bangkokDayStart,
  dayBuckets,
  parseRange,
  rangeStart,
  sumByDay,
} from "./range.ts";

// 2026-09-14 20:30 UTC = 2026-09-15 03:30 Bangkok. Every "today" question
// below must answer 15 Sep, never 14 — that is the whole point of the module.
const lateUtc = new Date("2026-09-14T20:30:00Z");

test("parseRange accepts the four ranges and falls back to 7d", () => {
  assert.equal(parseRange("today"), "today");
  assert.equal(parseRange("30d"), "30d");
  assert.equal(parseRange("all"), "all");
  assert.equal(parseRange("xyz"), "7d");
  assert.equal(parseRange(undefined), "7d");
  assert.equal(parseRange(["30d", "today"]), "30d");
});

test("bangkokDayKey uses the Bangkok calendar day", () => {
  assert.equal(bangkokDayKey(lateUtc), "2026-09-15");
  assert.equal(bangkokDayKey(new Date("2026-09-14T16:59:59Z")), "2026-09-14");
  assert.equal(bangkokDayKey(new Date("2026-09-14T17:00:00Z")), "2026-09-15");
});

test("bangkokDayStart is 17:00 UTC of the previous UTC day", () => {
  assert.equal(bangkokDayStart(lateUtc).toISOString(), "2026-09-14T17:00:00.000Z");
  assert.equal(
    bangkokDayStart(new Date("2026-09-14T02:00:00Z")).toISOString(),
    "2026-09-13T17:00:00.000Z",
  );
});

test("rangeStart counts calendar days including today", () => {
  assert.equal(rangeStart("today", lateUtc)?.toISOString(), "2026-09-14T17:00:00.000Z");
  assert.equal(rangeStart("7d", lateUtc)?.toISOString(), "2026-09-08T17:00:00.000Z");
  assert.equal(rangeStart("30d", lateUtc)?.toISOString(), "2026-08-16T17:00:00.000Z");
  assert.equal(rangeStart("all", lateUtc), null);
});

test("dayBuckets lists every day oldest → newest, ending today (Bangkok)", () => {
  const seven = dayBuckets("7d", lateUtc);
  assert.equal(seven.length, 7);
  assert.equal(seven[0], "2026-09-09");
  assert.equal(seven[6], "2026-09-15");
  const thirty = dayBuckets("30d", lateUtc);
  assert.equal(thirty.length, 30);
  assert.equal(thirty[0], "2026-08-17");
  assert.equal(thirty[29], "2026-09-15");
});

test("sumByDay totals per key, ignores rows outside the keys, scales to the max", () => {
  const out = sumByDay(
    ["2026-09-13", "2026-09-14", "2026-09-15"],
    [
      { day: "2026-09-14", amount: 50 },
      { day: "2026-09-14", amount: 150 },
      { day: "2026-09-15", amount: 100 },
      { day: "2026-09-01", amount: 999 },
    ],
  );
  assert.deepEqual(out, [
    { key: "2026-09-13", amount: 0, pct: 0 },
    { key: "2026-09-14", amount: 200, pct: 100 },
    { key: "2026-09-15", amount: 100, pct: 50 },
  ]);
});

test("sumByDay with no tips gives all-zero bars (no division by zero)", () => {
  assert.deepEqual(sumByDay(["2026-09-15"], []), [
    { key: "2026-09-15", amount: 0, pct: 0 },
  ]);
});
