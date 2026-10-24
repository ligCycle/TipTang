import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PK_DURATIONS,
  isPkDuration,
  cleanSideName,
  cleanHex,
  winnerOf,
  barShare,
  remainingSec,
  effectiveGraceSec,
  distinctColorB,
  DEFAULT_SIDES,
} from "./pk.ts";

test("durations and defaults", () => {
  assert.deepEqual([...PK_DURATIONS], [300, 600, 900]);
  assert.ok(isPkDuration(600));
  assert.ok(!isPkDuration(601));
  assert.ok(!isPkDuration("600"));
  assert.deepEqual(DEFAULT_SIDES, { nameA: "ทีมแดง", nameB: "ทีมน้ำเงิน", colorA: "#ef4444", colorB: "#3b82f6" });
});

test("cleanSideName trims and caps at 20", () => {
  assert.equal(cleanSideName("  ทีมแมว "), "ทีมแมว");
  assert.equal(cleanSideName(""), null);
  assert.equal(cleanSideName("x".repeat(21)), null);
  assert.equal(cleanSideName(5), null);
});

test("cleanHex accepts #rrggbb only", () => {
  assert.equal(cleanHex("#AbC123"), "#abc123");
  assert.equal(cleanHex("red"), null);
  assert.equal(cleanHex("#abc"), null);
});

test("winnerOf: higher total wins, equal is a draw", () => {
  assert.equal(winnerOf(100, 50), "A");
  assert.equal(winnerOf(50, 100), "B");
  assert.equal(winnerOf(70, 70), "draw");
  assert.equal(winnerOf(0, 0), "draw");
});

test("barShare: A's share in whole percent, 50 at 0-0, never 0/100 while the other has something", () => {
  assert.equal(barShare(0, 0), 50);
  assert.equal(barShare(100, 100), 50);
  assert.equal(barShare(300, 100), 75);
  assert.equal(barShare(1, 999), 1);
  assert.equal(barShare(999, 1), 99);
  assert.equal(barShare(50, 0), 100);
  assert.equal(barShare(0, 50), 0);
});

test("remainingSec", () => {
  const ends = new Date("2026-10-24T10:10:00Z");
  assert.equal(remainingSec(ends, new Date("2026-10-24T10:09:30.200Z")), 30);
  assert.equal(remainingSec(ends, new Date("2026-10-24T10:11:00Z")), 0);
});

test("effectiveGraceSec: the longer of the stored grace and today's setting", () => {
  assert.equal(effectiveGraceSec(60, true), 60);
  assert.equal(effectiveGraceSec(60, false), 300);
  assert.equal(effectiveGraceSec(300, true), 300);
  assert.equal(effectiveGraceSec(60, null), 60);
});

test("distinctColorB never repeats A's colour", () => {
  assert.equal(distinctColorB("#ef4444", "#22c55e"), "#22c55e");
  assert.equal(distinctColorB("#22c55e", "#22c55e"), "#3b82f6");
  assert.equal(distinctColorB("#3b82f6", "#3b82f6"), "#ef4444");
});

test("founder 2026-10-24: a side that gives up loses at once, whatever the totals", () => {
  assert.equal(winnerOf(100, 900, "B"), "A");
  assert.equal(winnerOf(900, 100, "A"), "B");
  assert.equal(winnerOf(500, 500, "A"), "B");
  assert.equal(winnerOf(900, 100, null), "A");
  assert.equal(winnerOf(500, 500), "draw");
});
