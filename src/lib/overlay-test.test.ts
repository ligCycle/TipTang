import { test } from "node:test";
import assert from "node:assert/strict";
import { pushTestAlert, readTestAlert } from "./overlay-test.ts";

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
