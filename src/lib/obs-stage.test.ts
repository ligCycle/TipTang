import { test } from "node:test";
import assert from "node:assert/strict";
import { ownLinkLive, stageCards } from "./obs-stage.ts";

const NOW = new Date("2026-10-24T10:00:00Z");
const ago = (s: number) => new Date(NOW.getTime() - s * 1000);
const FLAGS = { alerts: true, media: true, voice: false, wheel: true, gacha: false, boss: true, goal: true, timer: false, combo: true, pk: false };
const NONE = { wheel: false, gacha: false, media: false, boss: false };

test("own link is live within 2 minutes", () => {
  assert.equal(ownLinkLive(ago(60), NOW), true);
  assert.equal(ownLinkLive(ago(200), NOW), false);
  assert.equal(ownLinkLive(null, NOW), false);
});

test("main: popup cards that are on; a card with its own live link is left out (C4)", () => {
  const c = stageCards(FLAGS, { ...NONE, wheel: true }, NONE, "main");
  assert.deepEqual(c, { alerts: true, media: true, wheel: false, gacha: false, boss: true });
});

test("main: a pending test counts as on (C10)", () => {
  const c = stageCards(FLAGS, NONE, { ...NONE, gacha: true }, "main");
  assert.equal(c.gacha, true);
});

test("main: voice alone turns the media player on", () => {
  const c = stageCards({ ...FLAGS, media: false, voice: true }, NONE, NONE, "main");
  assert.equal(c.media, true);
});

test("bars: every bar card is listed (they hide themselves)", () => {
  assert.deepEqual(stageCards(FLAGS, NONE, NONE, "bars"), { goal: true, timer: true, combo: true, pk: true, boss: true });
});
