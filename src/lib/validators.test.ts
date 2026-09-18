import { test } from "node:test";
import assert from "node:assert/strict";
import { tipAmountSchema } from "./validators.ts";

test("tip amounts are whole baht within 1..100000", () => {
  assert.equal(tipAmountSchema.parse("20"), 20); // form data arrives as a string
  assert.equal(tipAmountSchema.parse(100000), 100000);
  for (const bad of [20.5, "20.555", 0, -5, 100001, "abc", ""]) {
    assert.equal(tipAmountSchema.safeParse(bad).success, false, String(bad));
  }
});
