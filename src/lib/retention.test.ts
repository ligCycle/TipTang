import { test } from "node:test";
import assert from "node:assert/strict";
import { slipCutoffs } from "./retention.ts";

test("slipCutoffs: 90 days for decided slips, 180 for everything", () => {
  const now = new Date("2026-09-30T00:00:00Z");
  const { decided, any } = slipCutoffs(now);
  assert.equal(decided.toISOString(), "2026-07-02T00:00:00.000Z");
  assert.equal(any.toISOString(), "2026-04-03T00:00:00.000Z");
});
