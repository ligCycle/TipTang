import { test } from "node:test";
import assert from "node:assert/strict";
import { UPDATES, hasUnseenUpdate, latestUpdateId } from "./updates.ts";

test("updates are listed newest first with ISO dates", () => {
  for (const u of UPDATES) assert.match(u.date, /^\d{4}-\d{2}-\d{2}$/, u.id);
  const dates = UPDATES.map((u) => u.date);
  assert.deepEqual(dates, [...dates].sort().reverse());
});

test("ids are unique and start with their own date", () => {
  const ids = UPDATES.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const u of UPDATES) assert.ok(u.id.startsWith(`${u.date}-`), u.id);
});

test("tags and copy are complete", () => {
  const allowed = new Set(["creator", "supporter", "security"]);
  for (const u of UPDATES) {
    assert.ok(u.tags.length > 0, u.id);
    for (const t of u.tags) assert.ok(allowed.has(t), `${u.id}: ${t}`);
    for (const lang of [u.th, u.en]) {
      assert.ok(lang.title.trim() && lang.body.trim(), u.id);
    }
    if (u.href) assert.ok(u.href.startsWith("/") && !u.href.startsWith("//"), u.id);
  }
});

test("the unseen dot follows the newest id", () => {
  assert.equal(latestUpdateId(), UPDATES[0].id);
  assert.equal(hasUnseenUpdate(null), true);
  assert.equal(hasUnseenUpdate(UPDATES[0].id), false);
  assert.equal(hasUnseenUpdate(UPDATES[1].id), true);
});
