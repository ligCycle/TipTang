import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLastSeen, overlaySetUp } from "./overlay-connection.ts";

test("parseLastSeen: ISO string → Date; null, empty or junk → null", () => {
  const d = parseLastSeen("2026-10-10T08:00:00.000Z");
  assert.ok(d instanceof Date);
  assert.equal(d?.toISOString(), "2026-10-10T08:00:00.000Z");
  assert.equal(parseLastSeen(null), null);
  assert.equal(parseLastSeen(""), null);
  assert.equal(parseLastSeen("not a date"), null);
  assert.equal(parseLastSeen(42), null);
});

test("overlaySetUp: a live program has loaded it, or a tip already came in", () => {
  const seen = new Date("2026-10-10T08:00:00Z");
  assert.equal(overlaySetUp(seen, 0), true);
  assert.equal(overlaySetUp(null, 1), true); // link-only creators: tips prove it works
  assert.equal(overlaySetUp(null, 0), false); // only opened the OBS page
});
