import { test } from "node:test";
import assert from "node:assert/strict";
import { pushTestAlert, readTestAlert, pushWheelTest, readWheelTest, pushComboTest, readComboTest, COMBO_TEST_MS, pushGachaTest, readGachaTest } from "./overlay-test.ts";

test("a pushed test can be read, and reading does not consume it", async () => {
  const now = Date.now();
  const t = await pushTestAlert("u1", 500, now);
  assert.equal(t.amount, 500);
  assert.equal((await readTestAlert("u1", now + 1000))?.id, t.id);
  assert.equal((await readTestAlert("u1", now + 2000))?.id, t.id);
});

test("a test expires after 15 seconds", async () => {
  const now = Date.now();
  await pushTestAlert("u2", 20, now);
  assert.notEqual(await readTestAlert("u2", now + 14_000), null);
  assert.equal(await readTestAlert("u2", now + 16_000), null);
});

test("each push gets a new id and replaces the previous test", async () => {
  const now = Date.now();
  const a = await pushTestAlert("u3", 20, now);
  const b = await pushTestAlert("u3", 500, now + 1);
  assert.notEqual(a.id, b.id);
  assert.equal((await readTestAlert("u3", now + 2))?.amount, 500);
});

test("creators do not see each other's tests", async () => {
  await pushTestAlert("u4", 20);
  assert.equal(await readTestAlert("u5"), null);
});

test("separate module instances share the in-process fallback (Next bundles each route apart)", async () => {
  // A variable specifier: fresh module instances via query strings (runtime only).
  const spec = "./overlay-test.ts";
  const a: typeof import("./overlay-test.ts") = await import(`${spec}?instance=a`);
  const b: typeof import("./overlay-test.ts") = await import(`${spec}?instance=b`);
  const t = await a.pushTestAlert("u6", 77);
  assert.equal((await b.readTestAlert("u6"))?.id, t.id);
});

test("wheel test: readable until it expires, separate from alert tests", async () => {
  const now = 2_000_000;
  const w = await pushWheelTest("u9", "wheel1", "t1#0", now);
  assert.deepEqual(await readWheelTest("u9", now + 1000), w);
  assert.equal(w.wheelId, "wheel1");
  assert.equal(w.segmentKey, "t1#0");
  assert.equal(await readTestAlert("u9", now + 1000), null);
  assert.equal(await readWheelTest("u9", now + 16_000), null);
});

test("combo test: keeps its start time until it expires, separate from other tests", async () => {
  const now = 3_000_000;
  const c = await pushComboTest("u7", now);
  assert.equal(c.startedAt, now);
  assert.deepEqual(await readComboTest("u7", now + 20_000), c);
  assert.equal(await readWheelTest("u7", now + 1000), null);
  assert.equal(await readComboTest("u7", now + COMBO_TEST_MS + 1), null);
});

test("gacha test pull: same result for every source, gone after 15 s, per user", async () => {
  const now = Date.now();
  const g = await pushGachaTest("g1", { rarity: "epic", prizeText: "ร้องเพลง", imageUrl: null }, now);
  assert.deepEqual(await readGachaTest("g1", now + 1000), g);
  assert.equal(await readGachaTest("g2", now + 1000), null);
  assert.equal(await readGachaTest("g1", now + 16_000), null);
});
