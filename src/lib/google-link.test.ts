import { test } from "node:test";
import assert from "node:assert/strict";
import { googleLinkUpdate } from "./google-link.ts";

const now = new Date("2026-09-30T00:00:00Z");

test("unverified password account: password dropped, sessions ended", () => {
  const d = googleLinkUpdate(
    { googleId: null, emailVerifiedAt: null, passwordHash: "hash" },
    "g-123",
    now,
  );
  assert.deepEqual(d, {
    googleId: "g-123",
    emailVerifiedAt: now,
    passwordHash: null,
    sessionVersion: { increment: 1 },
  });
});

test("verified password account keeps its password", () => {
  const d = googleLinkUpdate(
    { googleId: null, emailVerifiedAt: now, passwordHash: "hash" },
    "g-123",
    now,
  );
  assert.deepEqual(d, { googleId: "g-123" });
});

test("already linked and verified: nothing to write", () => {
  const d = googleLinkUpdate(
    { googleId: "g-123", emailVerifiedAt: now, passwordHash: null },
    "g-123",
    now,
  );
  assert.deepEqual(d, {});
});

test("unverified account without a password just becomes verified", () => {
  const d = googleLinkUpdate(
    { googleId: "g-1", emailVerifiedAt: null, passwordHash: null },
    "g-1",
    now,
  );
  assert.deepEqual(d, { emailVerifiedAt: now });
});
