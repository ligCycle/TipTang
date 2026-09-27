import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePaypalHandle,
  paypalLink,
  stripJsonFences,
  judgePaypalReceipt,
  type PaypalRead,
} from "./paypal.ts";

const FENCE = "`".repeat(3);

test("normalizePaypalHandle accepts names and paypal.me / paypal.com URLs", () => {
  for (const input of [
    "LigStream",
    "@LigStream",
    " paypal.me/LigStream ",
    "https://www.paypal.me/LigStream/10",
    "https://paypal.me/LigStream?locale.x=th_TH",
    "https://www.paypal.com/paypalme/LigStream",
  ]) {
    assert.equal(normalizePaypalHandle(input), "LigStream", input);
  }
  assert.equal(normalizePaypalHandle(""), null);
  assert.equal(normalizePaypalHandle("   "), null);
  assert.equal(normalizePaypalHandle("bad name!"), "invalid");
  assert.equal(normalizePaypalHandle("a".repeat(21)), "invalid");
  assert.equal(normalizePaypalHandle("https://evil.com/LigStream"), "invalid");
});

test("paypalLink puts a whole-baht THB amount in the path", () => {
  assert.equal(paypalLink("LigStream", 300), "https://paypal.me/LigStream/300THB");
});

test("stripJsonFences removes markdown fences and whitespace", () => {
  const json = '{"a":1}';
  assert.equal(stripJsonFences(json), json);
  assert.equal(stripJsonFences(`${FENCE}json\n${json}\n${FENCE}`), json);
  assert.equal(stripJsonFences(`${FENCE}\n${json}\n${FENCE}`), json);
  assert.equal(stripJsonFences(`  \n${FENCE}JSON\n${json}\n${FENCE}  \n`), json);
});

const ok = (over: Partial<Extract<PaypalRead, { kind: "ok" }>> = {}): PaypalRead => ({
  kind: "ok",
  isPaypalReceipt: true,
  completed: true,
  status: "Completed",
  amount: 300,
  currency: "THB",
  recipient: "Lig Stream",
  transactionId: "9AB12345CD6789012",
  ...over,
});

test("judgePaypalReceipt maps every case to a verdict", () => {
  assert.deepEqual(judgePaypalReceipt({ kind: "disabled" }, 300), {
    verifyCode: null,
    verifyDetail: null,
    transRef: null,
  });
  assert.deepEqual(judgePaypalReceipt({ kind: "error" }, 300), {
    verifyCode: "unreadable",
    verifyDetail: null,
    transRef: null,
  });
  assert.equal(judgePaypalReceipt(ok({ isPaypalReceipt: false }), 300).verifyCode, "notslip");
  const pending = judgePaypalReceipt(ok({ completed: false, status: "Pending" }), 300);
  assert.equal(pending.verifyCode, "pp_pending");
  assert.equal(pending.verifyDetail, "Pending");
  assert.deepEqual(judgePaypalReceipt(ok(), 300), {
    verifyCode: "match",
    verifyDetail: "Lig Stream",
    transRef: "PP:9AB12345CD6789012",
  });
  assert.equal(judgePaypalReceipt(ok({ amount: 301 }), 300).verifyCode, "match"); // ±1 baht
  assert.equal(judgePaypalReceipt(ok({ amount: 299 }), 300).verifyCode, "match");
  const wrong = judgePaypalReceipt(ok({ amount: 250 }), 300);
  assert.equal(wrong.verifyCode, "amount");
  assert.match(wrong.verifyDetail ?? "", /250/);
  const usd = judgePaypalReceipt(ok({ amount: 8.5, currency: "usd" }), 300);
  assert.equal(usd.verifyCode, "pp_currency");
  assert.equal(usd.verifyDetail, "8.5 USD");
  assert.equal(judgePaypalReceipt(ok({ amount: null }), 300).verifyCode, "unreadable");
});

test("transaction ids are normalised so the same receipt collides", () => {
  const a = judgePaypalReceipt(ok({ transactionId: " 9ab12345cd6789012 " }), 300);
  const b = judgePaypalReceipt(ok({ transactionId: "9AB12345CD6789012" }), 300);
  assert.equal(a.transRef, b.transRef);
  assert.equal(judgePaypalReceipt(ok({ transactionId: "" }), 300).transRef, null);
});
