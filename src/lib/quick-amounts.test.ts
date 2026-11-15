import { test } from "node:test";
import assert from "node:assert/strict";
import { quickAmountsFor } from "./quick-amounts.ts";

test("the default minimum of 1 keeps the standard chips (no 1 baht chip)", () => {
  assert.deepEqual(quickAmountsFor(1), [20, 50, 100, 200, 500]);
});

test("a minimum below 20 becomes the first chip", () => {
  assert.deepEqual(quickAmountsFor(10), [10, 20, 50, 100, 200, 500]);
  assert.deepEqual(quickAmountsFor(15), [15, 20, 50, 100, 200, 500]);
});

test("a minimum of 20 or more drops the chips below it", () => {
  assert.deepEqual(quickAmountsFor(20), [20, 50, 100, 200, 500]);
  assert.deepEqual(quickAmountsFor(50), [50, 100, 200, 500]);
});

test("a high minimum switches to multiples of it so the row is never empty", () => {
  assert.deepEqual(quickAmountsFor(300), [300, 600, 1500, 3000]);
});
