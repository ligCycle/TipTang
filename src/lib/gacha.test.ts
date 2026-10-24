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
  drawFromBox,
  boxOdds,
  looksLikeMoney,
  isGachaBox,
  type GachaBox,
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

const BOX: GachaBox = {
  odds: { common: 70, rare: 25, epic: 5 },
  prizes: [
    { id: "c1", rarity: "common", text: "ขอบคุณ", imageUrl: null, noAction: true },
    { id: "c2", rarity: "common", text: "เต้น", imageUrl: null, noAction: false },
    { id: "e1", rarity: "epic", text: "ร้องเพลง", imageUrl: "/x.png", noAction: false },
  ],
};

test("drawFromBox uses the box the fan saw: an empty rare tier never comes out", () => {
  // weights from the box: common 70, rare 0 (no prizes), epic 5 → total 75
  assert.deepEqual(boxOdds(BOX), { common: 93, rare: 0, epic: 7 });
  const picks = new Set<string>();
  for (let roll = 0; roll < 75; roll++) {
    let call = 0;
    const r = drawFromBox(BOX, (n) => (call++ === 0 ? roll : n - 1));
    if (r) picks.add(r.rarity);
  }
  assert.deepEqual([...picks].sort(), ["common", "epic"]);
  assert.equal(drawFromBox(BOX, () => 74)?.prize.id, "e1");
  assert.equal(drawFromBox(BOX, () => 0)?.prize.id, "c1");
  assert.equal(drawFromBox({ odds: BOX.odds, prizes: [] }, () => 0), null);
});

test("looksLikeMoney catches money and money-like prizes only", () => {
  for (const t of ["เงิน 100 บาท", "โอนให้ 50฿", "บัตรเติมเงิน", "TrueMoney 20", "gift card", "Giftcard", "500 thb", "100บ.", "100 บ", "เติมเกม 100", "promptpay 20", "เงินสด", "robux"]) {
    assert.ok(looksLikeMoney(t), t);
  }
  for (const t of ["ร้องเพลง 1 เพลง", "เต้น", "ชื่อในคลิป", "เล่นเกม 10 นาที", "สีเงิน", "คูปองขอเพลง", "โอนอ่อน", "บาทหลวง", "ทำท่า 3 บท"]) {
    assert.ok(!looksLikeMoney(t), t);
  }
});

test("isGachaBox accepts a stored box and rejects junk", () => {
  assert.ok(isGachaBox(BOX));
  assert.ok(isGachaBox(JSON.parse(JSON.stringify(BOX))));
  assert.ok(!isGachaBox(null));
  assert.ok(!isGachaBox({ odds: BOX.odds }));
  assert.ok(!isGachaBox({ odds: { common: 1 }, prizes: [] }));
  assert.ok(!isGachaBox({ odds: BOX.odds, prizes: [{ id: "x", rarity: "mythic", text: "a", imageUrl: null, noAction: false }] }));
});

test("isGachaBox requires whole, non-negative odds", () => {
  assert.ok(!isGachaBox({ ...BOX, odds: { common: 70.5, rare: 25, epic: 4.5 } }));
  assert.ok(!isGachaBox({ ...BOX, odds: { common: -1, rare: 96, epic: 5 } }));
});

test("looksLikeMoney: Thai digits, written amounts, gifts of value", () => {
  for (const t of ["ห้าร้อยบาท", "๑๐๐ บาท", "แจกเงิน 100", "ให้เงิน", "บัตรของขวัญ", "ทองคำ 1 สลึง", "Steam Wallet"]) {
    assert.ok(looksLikeMoney(t), t);
  }
  for (const t of ["บาทหลวงอวยพร", "ทองหล่อ", "สีทอง"]) {
    assert.ok(!looksLikeMoney(t), t);
  }
});
