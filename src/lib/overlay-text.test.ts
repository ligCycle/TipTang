import { test } from "node:test";
import assert from "node:assert/strict";
import { OVERLAY_TEXT, overlayLangOf } from "./overlay-text.ts";

test("language: en stays en, anything else is Thai", () => {
  assert.equal(overlayLangOf("en"), "en");
  assert.equal(overlayLangOf("th"), "th");
  assert.equal(overlayLangOf("jp"), "th");
  assert.equal(overlayLangOf(null), "th");
});

test("both languages fill every line", () => {
  const keys = (o: object) => Object.keys(o).sort();
  assert.deepEqual(keys(OVERLAY_TEXT.en), keys(OVERLAY_TEXT.th));
  assert.deepEqual(keys(OVERLAY_TEXT.en.range), keys(OVERLAY_TEXT.th.range));
  assert.deepEqual(keys(OVERLAY_TEXT.en.rarity), keys(OVERLAY_TEXT.th.rarity));
});

test("lines with numbers read naturally in each language", () => {
  assert.equal(OVERLAY_TEXT.th.bossOf(2, 5), "บอส 2/5");
  assert.equal(OVERLAY_TEXT.en.bossOf(2, 5), "Boss 2/5");
  assert.equal(OVERLAY_TEXT.en.fromFans("฿500", 1), "฿500 from 1 person");
  assert.equal(OVERLAY_TEXT.en.fromFans("฿500", 3), "฿500 from 3 people");
  assert.equal(OVERLAY_TEXT.th.comboSummary("1,200", 4), "รวม ฿1,200 จาก 4 คน · ขอบคุณทุกคน");
});
