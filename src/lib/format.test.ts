import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate, relativeTime } from "./format.ts";

// 13:50 UTC is 20:50 in Bangkok. The output must not depend on the machine's
// timezone: Vercel renders in UTC, browsers in Bangkok, and any difference
// is a hydration mismatch in every client component that shows a date.
const AT = "2026-08-05T13:50:00Z";

test("formatDate renders Bangkok wall-clock time regardless of process TZ", () => {
  assert.equal(formatDate(AT, "en-US"), "Aug 5, 2026, 8:50 PM");
  assert.match(formatDate(AT), /20:50$/);
  assert.equal(formatDate(new Date(AT), "en-US"), formatDate(AT, "en-US"));
});

test("relativeTime buckets minutes / hours / days in both locales", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  assert.equal(relativeTime(ago(20_000), now, "th"), "เมื่อสักครู่");
  assert.equal(relativeTime(ago(5 * 60_000), now, "th"), "5 นาทีก่อน");
  assert.equal(relativeTime(ago(3 * 3_600_000), now, "th"), "3 ชม.ก่อน");
  assert.equal(relativeTime(ago(12 * 86_400_000), now, "th"), "12 วันก่อน");
  assert.equal(relativeTime(ago(20_000), now, "en"), "just now");
  assert.equal(relativeTime(ago(5 * 60_000), now, "en"), "5 min ago");
  assert.equal(relativeTime(ago(3 * 3_600_000), now, "en"), "3 h ago");
  assert.equal(relativeTime(ago(12 * 86_400_000), now, "en"), "12 days ago");
  // A clock slightly ahead of "now" is still "just now", never negative.
  assert.equal(relativeTime(new Date(now.getTime() + 5_000), now, "en"), "just now");
});
