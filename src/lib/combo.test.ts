import { test } from "node:test";
import assert from "node:assert/strict";
import {
  typicalTip,
  autoSizes,
  sizesFor,
  sizeAt,
  addAmount,
  removeAmount,
  countFans,
  cleanRows,
  DEFAULT_ROWS,
  MAX_LEVELS,
} from "./combo.ts";

test("typicalTip: median of ≥5 tips; fewer → max(min, 50)", () => {
  assert.equal(typicalTip([20, 50, 50, 100, 500], 1), 50);
  assert.equal(typicalTip([20, 40], 1), 50);
  assert.equal(typicalTip([], 80), 80);
  assert.equal(typicalTip([10, 20, 30, 40], 1), 50);
  assert.equal(typicalTip([10, 20, 30, 40, 50, 60], 1), 35);
});

test("autoSizes: level 1 = typical × base, ×1.3 chained, nearest ฿10", () => {
  assert.deepEqual(autoSizes(50, "medium", 5), [180, 230, 300, 380, 500]);
  assert.equal(autoSizes(50, "easy", 1)[0], 130);
  assert.equal(autoSizes(50, "hard", 1)[0], 250);
  assert.ok(autoSizes(1, "easy", 5).every((s) => s >= 10));
});

test("sizesFor: custom uses row amounts, null rows fall back to auto", () => {
  const rows = [
    { amount: 100, reward: "" },
    { amount: null, reward: "x" },
  ];
  assert.deepEqual(sizesFor(rows, "custom", 50), [100, 230]);
  assert.deepEqual(sizesFor(rows, "medium", 50), [180, 230]);
});

test("sizeAt: past the last row uses the last size", () => {
  assert.equal(sizeAt([100, 200], 1), 100);
  assert.equal(sizeAt([100, 200], 5), 200);
});

test("addAmount: carries over and lists every reached level", () => {
  assert.deepEqual(addAmount({ level: 1, progress: 0 }, 1000, [100, 200, 300]), {
    level: 5,
    progress: 100,
    reached: [2, 3, 4, 5],
  });
});

test("addAmount: exact fill reaches the next level with 0 progress", () => {
  assert.deepEqual(addAmount({ level: 1, progress: 80 }, 20, [100, 200]), { level: 2, progress: 0, reached: [2] });
  assert.deepEqual(addAmount({ level: 1, progress: 0 }, 30, [100]), { level: 1, progress: 30, reached: [] });
});

test("removeAmount: floors at 0 and never lowers the level", () => {
  assert.deepEqual(removeAmount({ level: 3, progress: 40 }, 100), { level: 3, progress: 0 });
  assert.deepEqual(removeAmount({ level: 2, progress: 90 }, 30), { level: 2, progress: 60 });
});

test("countFans: trims, ignores case, empty names are one fan", () => {
  assert.equal(countFans(["มะลิ", " มะลิ ", "Beam", "beam", "", ""]), 3);
  assert.equal(countFans(["", "  "]), 1);
});

test("cleanRows: validates rows, amounts only in custom", () => {
  assert.deepEqual(cleanRows([{ amount: 100, reward: "ignored" }, { amount: 200, reward: " ร้อง " }], true), [
    { amount: 100, reward: "" },
    { amount: 200, reward: "ร้อง" },
  ]);
  assert.deepEqual(cleanRows([{ amount: 100, reward: "" }, { reward: "a" }], false), [
    { amount: null, reward: "" },
    { amount: null, reward: "a" },
  ]);
  assert.equal(cleanRows([{ amount: 0, reward: "" }], true), null);
  assert.equal(cleanRows([{ amount: 1.5, reward: "" }], true), null);
  assert.equal(cleanRows([{ amount: 100001, reward: "" }], true), null);
  assert.equal(cleanRows([{ reward: "" }], true), null);
  assert.equal(cleanRows([], false), null);
  assert.equal(cleanRows(Array.from({ length: MAX_LEVELS + 1 }, () => ({ reward: "" })), false), null);
  assert.equal(cleanRows([{ reward: "" }, { reward: "x".repeat(41) }], false), null);
  assert.equal(cleanRows("nope", false), null);
});

test("DEFAULT_ROWS: spec rewards at levels 2–5, level 1 empty", () => {
  assert.deepEqual(
    DEFAULT_ROWS.map((r) => r.reward),
    ["", "พูดสำเนียงที่แชทเลือก 1 นาที", "ร้อง 1 เพลงที่แชทขอ", "ตอบคำถามแชท 3 ข้อ", "ไลฟ์ต่ออีก 30 นาที"],
  );
  assert.ok(DEFAULT_ROWS.every((r) => r.amount === null));
});
