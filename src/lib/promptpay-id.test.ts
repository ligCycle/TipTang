import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidPromptpayId } from "./promptpay-id.ts";

test("mobile numbers: 10 digits starting with 0", () => {
  assert.equal(isValidPromptpayId("0812345678"), true);
  assert.equal(isValidPromptpayId("812345678"), false);
  assert.equal(isValidPromptpayId("08123456789"), false);
});

test("national ids: 13 digits with a correct checksum", () => {
  assert.equal(isValidPromptpayId("1101700230708"), true);
  assert.equal(isValidPromptpayId("1101700230707"), false); // last digit off by one
  // Phone + extra digits: the checksum happens to fit, but ids never start with 0.
  assert.equal(isValidPromptpayId("0870412345121"), false);
  assert.equal(isValidPromptpayId("9101700230705"), false); // 9 is not a person type
  assert.equal(isValidPromptpayId("110170023070"), false); // 12 digits
});

test("non-digits and empty are rejected", () => {
  assert.equal(isValidPromptpayId(""), false);
  assert.equal(isValidPromptpayId("0812345678หฟ"), false);
  assert.equal(isValidPromptpayId("081-234-5678"), false);
});
