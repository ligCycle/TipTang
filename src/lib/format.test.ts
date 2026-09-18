import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate } from "./format.ts";

// 13:50 UTC is 20:50 in Bangkok. The output must not depend on the machine's
// timezone: Vercel renders in UTC, browsers in Bangkok, and any difference
// is a hydration mismatch in every client component that shows a date.
const AT = "2026-08-05T13:50:00Z";

test("formatDate renders Bangkok wall-clock time regardless of process TZ", () => {
  assert.equal(formatDate(AT, "en-US"), "Aug 5, 2026, 8:50 PM");
  assert.match(formatDate(AT), /20:50$/);
  assert.equal(formatDate(new Date(AT), "en-US"), formatDate(AT, "en-US"));
});
