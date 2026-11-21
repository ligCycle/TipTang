import { test } from "node:test";
import assert from "node:assert/strict";
import { OFF_AIR_POLL_MS, OWN_LINK_POLL_MS, hotPollDue, pollDelayMs } from "./poll-pace.ts";

const live = { shown: true, streaming: true };

test("live and on screen: the link's own pace", () => {
  assert.equal(pollDelayMs(3000, live), 3000);
  assert.equal(pollDelayMs(OWN_LINK_POLL_MS, live), 10_000);
});

test("OBS open but not streaming or recording: slow down", () => {
  assert.equal(pollDelayMs(3000, { shown: true, streaming: false }), OFF_AIR_POLL_MS);
  assert.equal(pollDelayMs(10_000, { shown: true, streaming: false }), 15_000);
});

test("scene not shown or tab hidden: slow down", () => {
  assert.equal(pollDelayMs(3000, { shown: false, streaming: true }), 15_000);
});

test("hot popup: asks when it turns hot, when it cools, and at most every 10 s while it stays hot", () => {
  assert.equal(hotPollDue({ hot: true, wasHot: false, sinceLastMs: 500 }), true);
  assert.equal(hotPollDue({ hot: false, wasHot: true, sinceLastMs: 500 }), true);
  assert.equal(hotPollDue({ hot: true, wasHot: true, sinceLastMs: 3000 }), false);
  assert.equal(hotPollDue({ hot: true, wasHot: true, sinceLastMs: 10_000 }), true);
  assert.equal(hotPollDue({ hot: false, wasHot: false, sinceLastMs: 60_000 }), false);
});

test("a pace already slower than the off-air one is kept", () => {
  assert.equal(pollDelayMs(60_000, { shown: false, streaming: false }), 60_000);
  assert.equal(pollDelayMs(15_000, { shown: true, streaming: false }), 15_000);
});
