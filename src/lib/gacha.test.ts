import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RARITIES,
  DEFAULT_ODDS,
  effectiveOdds,
  displayPercents,
  rebalance,
  drawRarity,
  drawPrize,
  cleanPrizeText,
  isRarity,
  cleanOdds,
  MAX_PRIZES_PER_RARITY,
  MAX_PRIZES,
  MAX_PRIZE_TEXT,
} from "./gacha.ts";

test("constants", () => {
  assert.deepEqual([...RARITIES], ["common", "rare", "epic"]);
  assert.deepEqual(DEFAULT_ODDS, { common: 70, rare: 25, epic: 5 });
  assert.equal(MAX_PRIZES_PER_RARITY, 10);
  assert.equal(MAX_PRIZES, 24);
  assert.equal(MAX_PRIZE_TEXT, 40);
  assert.ok(isRarity("rare"));
  assert.ok(!isRarity("legendary"));
  assert.ok(!isRarity("constructor"));
});

test("effectiveOdds: a rarity with no prizes gets 0 and the rest keep their ratio", () => {
  assert.deepEqual(effectiveOdds(DEFAULT_ODDS, { common: 3, rare: 2, epic: 1 }), { common: 70, rare: 25, epic: 5 });
  assert.deepEqual(effectiveOdds(DEFAULT_ODDS, { common: 3, rare: 2, epic: 0 }), { common: 70, rare: 25, epic: 0 });
  assert.deepEqual(effectiveOdds(DEFAULT_ODDS, { common: 0, rare: 0, epic: 0 }), { common: 0, rare: 0, epic: 0 });
  // Prizes only where the creator set 0%: they can still come out, evenly.
  assert.deepEqual(effectiveOdds({ common: 100, rare: 0, epic: 0 }, { common: 0, rare: 2, epic: 1 }), { common: 0, rare: 1, epic: 1 });
});

test("displayPercents always sums to 100 (largest remainder) when anything can come out", () => {
  const p = displayPercents({ common: 70, rare: 25, epic: 0 });
  assert.equal(p.common + p.rare + p.epic, 100);
  assert.deepEqual(p, { common: 74, rare: 26, epic: 0 });
  const thirds = displayPercents({ common: 1, rare: 1, epic: 1 });
  assert.equal(thirds.common + thirds.rare + thirds.epic, 100);
  assert.deepEqual(displayPercents({ common: 0, rare: 0, epic: 0 }), { common: 0, rare: 0, epic: 0 });
});

test("rebalance keeps the sum at 100 and moves the others in proportion", () => {
  assert.deepEqual(rebalance(DEFAULT_ODDS, "epic", 10), { common: 66, rare: 24, epic: 10 });
  assert.deepEqual(rebalance(DEFAULT_ODDS, "common", 100), { common: 100, rare: 0, epic: 0 });
  assert.deepEqual(rebalance({ common: 100, rare: 0, epic: 0 }, "common", 40), { common: 40, rare: 30, epic: 30 });
  const r = rebalance(DEFAULT_ODDS, "rare", 33);
  assert.equal(r.common + r.rare + r.epic, 100);
  assert.equal(r.rare, 33);
  assert.deepEqual(rebalance(DEFAULT_ODDS, "rare", -5).rare, 0);
  assert.deepEqual(rebalance(DEFAULT_ODDS, "rare", 150).rare, 100);
});

test("cleanOdds accepts only whole numbers summing to 100", () => {
  assert.deepEqual(cleanOdds({ common: 60, rare: 30, epic: 10 }), { common: 60, rare: 30, epic: 10 });
  assert.equal(cleanOdds({ common: 60, rare: 30, epic: 11 }), null);
  assert.equal(cleanOdds({ common: 60.5, rare: 29.5, epic: 10 }), null);
  assert.equal(cleanOdds({ common: -10, rare: 100, epic: 10 }), null);
  assert.equal(cleanOdds(null), null);
});

test("drawRarity follows the weights and never picks a 0-weight rarity", () => {
  const w = { common: 70, rare: 25, epic: 5 };
  assert.equal(drawRarity(w, () => 0), "common");
  assert.equal(drawRarity(w, () => 69), "common");
  assert.equal(drawRarity(w, () => 70), "rare");
  assert.equal(drawRarity(w, () => 94), "rare");
  assert.equal(drawRarity(w, () => 95), "epic");
  assert.equal(drawRarity(w, () => 99), "epic");
  assert.equal(drawRarity({ common: 0, rare: 3, epic: 0 }, () => 2), "rare");
  assert.equal(drawRarity({ common: 0, rare: 0, epic: 0 }, () => 0), null);
});

test("drawPrize picks evenly inside the rarity", () => {
  const prizes = [
    { id: "a", rarity: "common" as const },
    { id: "b", rarity: "rare" as const },
    { id: "c", rarity: "common" as const },
  ];
  assert.equal(drawPrize(prizes, "common", () => 0)?.id, "a");
  assert.equal(drawPrize(prizes, "common", () => 1)?.id, "c");
  assert.equal(drawPrize(prizes, "epic", () => 0), null);
});

test("cleanPrizeText trims and caps at 40", () => {
  assert.equal(cleanPrizeText("  ร้องเพลง 1 เพลง  "), "ร้องเพลง 1 เพลง");
  assert.equal(cleanPrizeText(""), null);
  assert.equal(cleanPrizeText("x".repeat(41)), null);
  assert.equal(cleanPrizeText(42), null);
});
