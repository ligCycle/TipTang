import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocate,
  moveOnDelete,
  spillOnPrice,
  extrasFloor,
  topUnfilled,
  isFull,
  cleanItemName,
  cleanItemPrice,
  peelRows,
  MAX_ITEM_NAME,
  MAX_ITEM_PRICE,
  type ItemState,
} from "./wishlist.ts";
import { spinFloor } from "./wheel.ts";

const items = (...xs: [string, number, number][]): ItemState[] => xs.map(([id, price, raised]) => ({ id, price, raised }));

test("allocate: no choice goes to the top unfilled item", () => {
  assert.deepEqual(allocate(items(["a", 100, 100], ["b", 100, 0], ["c", 100, 0]), 30, null), [{ itemId: "b", amount: 30 }]);
});

test("allocate: a chosen unfilled item gets the tip", () => {
  assert.deepEqual(allocate(items(["a", 100, 0], ["b", 100, 0]), 30, "b"), [{ itemId: "b", amount: 30 }]);
});

test("allocate: a chosen full item sends the tip to the next unfilled one", () => {
  assert.deepEqual(allocate(items(["a", 100, 0], ["b", 100, 100], ["c", 100, 0]), 30, "b"), [{ itemId: "c", amount: 30 }]);
});

test("allocate: overflow splits into the next unfilled items, wrapping to the top", () => {
  assert.deepEqual(allocate(items(["a", 100, 0], ["b", 100, 0], ["c", 100, 80]), 150, "c"), [
    { itemId: "c", amount: 20 },
    { itemId: "a", amount: 100 },
    { itemId: "b", amount: 30 },
  ]);
});

test("allocate: when every item is full the rest goes to the last item", () => {
  // b takes 10 to fill, the other 40 has nowhere unfilled to go → last item (b again), one row.
  assert.deepEqual(allocate(items(["a", 100, 100], ["b", 100, 90]), 50, null), [{ itemId: "b", amount: 50 }]);
  assert.deepEqual(allocate(items(["a", 100, 100], ["b", 100, 100]), 50, "a"), [{ itemId: "b", amount: 50 }]);
});

test("allocate: bad amounts or no items allocate nothing", () => {
  assert.deepEqual(allocate(items(["a", 100, 0]), 0, null), []);
  assert.deepEqual(allocate(items(["a", 100, 0]), Number.NaN, null), []);
  assert.deepEqual(allocate([], 50, null), []);
  assert.deepEqual(allocate(items(["a", 100, 0]), 50, "missing"), [{ itemId: "a", amount: 50 }]);
});

test("moveOnDelete: an unfilled item's baht goes to the top unfilled other item; a full one moves nothing", () => {
  assert.deepEqual(moveOnDelete(items(["a", 100, 100], ["b", 100, 40], ["c", 100, 0]), "b"), [{ itemId: "c", amount: 40 }]);
  assert.deepEqual(moveOnDelete(items(["a", 100, 100], ["b", 100, 100], ["c", 100, 0]), "b"), []);
  assert.deepEqual(moveOnDelete(items(["a", 100, 0], ["b", 100, 30]), "b"), [{ itemId: "a", amount: 30 }]);
  assert.deepEqual(moveOnDelete(items(["a", 100, 30]), "a"), []);
});

test("spillOnPrice: lowering a price below what's raised spills the excess onward", () => {
  assert.deepEqual(spillOnPrice(items(["a", 100, 80], ["b", 100, 0]), "a", 50), { from: "a", to: [{ itemId: "b", amount: 30 }] });
  assert.deepEqual(spillOnPrice(items(["a", 100, 80], ["b", 100, 0]), "a", 90), { from: "a", to: [] });
});

test("topUnfilled / isFull", () => {
  assert.equal(topUnfilled(items(["a", 100, 100], ["b", 100, 10]))?.id, "b");
  assert.equal(topUnfilled(items(["a", 100, 100])), null);
  assert.equal(isFull({ id: "a", price: 100, raised: 100 }), true);
});

test("extrasFloor: extras add up, creator minimum is the floor; spinFloor still works", () => {
  assert.equal(extrasFloor(20, [50, null, 30]), 80);
  assert.equal(extrasFloor(100, [50]), 100);
  assert.equal(extrasFloor(20, []), 20);
  assert.equal(spinFloor(20, 50, 30), 80);
  assert.equal(spinFloor(20, 50, null), 50);
});

test("clean name and price", () => {
  assert.equal(cleanItemName("  ไมค์ใหม่ "), "ไมค์ใหม่");
  assert.equal(cleanItemName(""), null);
  assert.equal(cleanItemName("x".repeat(MAX_ITEM_NAME + 1)), null);
  assert.equal(cleanItemPrice(3500), 3500);
  assert.equal(cleanItemPrice("200"), 200);
  assert.equal(cleanItemPrice(0), null);
  assert.equal(cleanItemPrice(1.5), null);
  assert.equal(cleanItemPrice(MAX_ITEM_PRICE + 1), null);
});

test("spillOnPrice: raising or keeping a price never moves baht, even on an item past 100%", () => {
  const over = items(["a", 100, 100], ["b", 100, 150], ["c", 100, 0]);
  assert.deepEqual(spillOnPrice(over, "b", 120), { from: "b", to: [] });
  assert.deepEqual(spillOnPrice(over, "b", 100), { from: "b", to: [] });
  // Lowering 100 → 90 frees only the 10 newly over the price, not the old overflow.
  assert.deepEqual(spillOnPrice(over, "b", 90), { from: "b", to: [{ itemId: "c", amount: 10 }] });
});

test("allocate: one row per item even when the fill wraps back to the chosen item", () => {
  assert.deepEqual(allocate(items(["a", 100, 0], ["b", 100, 0], ["c", 100, 80]), 300, "c"), [
    { itemId: "c", amount: 100 },
    { itemId: "a", amount: 100 },
    { itemId: "b", amount: 100 },
  ]);
});

test("goal enums", async () => {
  const m = await import("./wishlist.ts");
  assert.equal(m.isGoalStyle("ring"), true);
  assert.equal(m.isGoalStyle("thin"), false);
  assert.equal(m.isGoalDisplay("rotate"), true);
  assert.equal(m.isGoalType("multi"), true);
});

test("peelRows takes from the newest rows first and splits the last one", () => {
  const t1 = new Date("2026-10-23T10:00:00Z");
  const t2 = new Date("2026-10-23T11:00:00Z");
  const rows = [
    { id: "r2", tipId: "b", amount: 30, createdAt: t2 },
    { id: "r1", tipId: "a", amount: 100, createdAt: t1 },
  ];
  const out = peelRows(rows, [{ itemId: "x", amount: 20 }, { itemId: "y", amount: 50 }]);
  assert.deepEqual(out.creates, [
    { tipId: "b", itemId: "x", amount: 20, createdAt: t2 },
    { tipId: "b", itemId: "y", amount: 10, createdAt: t2 },
    { tipId: "a", itemId: "y", amount: 40, createdAt: t1 },
  ]);
  assert.deepEqual(out.deletes, ["r2"]);
  assert.deepEqual(out.updates, [{ id: "r1", amount: 60 }]);
});

test("peelRows moves no more than the rows hold, and nothing for no targets", () => {
  const rows = [{ id: "r1", tipId: "a", amount: 10, createdAt: new Date(0) }];
  const out = peelRows(rows, [{ itemId: "x", amount: 50 }]);
  assert.equal(out.creates.reduce((s, c) => s + c.amount, 0), 10);
  assert.deepEqual(out.deletes, ["r1"]);
  assert.deepEqual(peelRows(rows, []), { creates: [], deletes: [], updates: [] });
});
