import { test } from "node:test";
import assert from "node:assert/strict";
import { slipCutoffs, slipDeleteDate } from "./retention.ts";

test("slipCutoffs: 90 days for decided slips, 180 for everything", () => {
  const now = new Date("2026-09-30T00:00:00Z");
  const { decided, any } = slipCutoffs(now);
  assert.equal(decided.toISOString(), "2026-07-02T00:00:00.000Z");
  assert.equal(any.toISOString(), "2026-04-03T00:00:00.000Z");
});

test("slipDeleteDate: first 03:00-Bangkok run after 90 days", () => {
  // 5 Aug 2026 20:50 Bangkok = 13:50 UTC → due 3 Nov 13:50 UTC → that
  // evening's 20:00 UTC run (= 4 Nov 03:00 Bangkok).
  const d = slipDeleteDate(new Date("2026-08-05T13:50:00Z"), true);
  assert.equal(d.toISOString(), "2026-11-03T20:00:00.000Z");
});

test("slipDeleteDate: due after the day's run rolls to the next night", () => {
  const d = slipDeleteDate(new Date("2026-08-05T21:00:00Z"), true);
  assert.equal(d.toISOString(), "2026-11-04T20:00:00.000Z");
});

test("slipDeleteDate: undecided slips wait 180 days", () => {
  const d = slipDeleteDate(new Date("2026-08-05T13:50:00Z"), false);
  assert.equal(d.toISOString(), "2027-02-01T20:00:00.000Z");
});
