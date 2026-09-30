import { test } from "node:test";
import assert from "node:assert/strict";
import { maskPayout } from "./mask.ts";

test("maskPayout keeps the last 4 digits of a number", () => {
  assert.equal(maskPayout("0812345678"), "•••5678");
  assert.equal(maskPayout("1101700230708"), "•••0708");
});

test("maskPayout shows only the start of a PayPal handle", () => {
  assert.equal(maskPayout("tiptangshop"), "ti•••");
});

test("maskPayout marks an empty value as removed", () => {
  assert.equal(maskPayout(null), "—");
  assert.equal(maskPayout(""), "—");
});
