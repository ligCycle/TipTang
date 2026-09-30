import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { packBackup, unpackBackup, type BackupPayload } from "./backup-format.ts";
import { BackupError, encryptBackup } from "./backup-crypto.ts";

const PASS = "correct horse battery";

const payload: BackupPayload = {
  format: 1,
  createdAt: "2026-09-30T11:30:00.000Z",
  source: "localhost:51311/template1",
  migrations: ["20260716000000_init", "20260930000000_security_hardening"],
  tables: {
    User: [
      {
        id: "u1",
        displayName: "ทิปตัง \"quote\" \\ back\nnewline 💖",
        bio: null,
        socialLinks: { youtube: "https://youtube.com/@x", kick: null },
        goalAmount: 1234.5,
        createdAt: "2026-08-05T13:50:00.123",
      },
    ],
    Review: [],
  },
};

test("pack → unpack returns an identical payload", () => {
  assert.deepEqual(unpackBackup(packBackup(payload, PASS), PASS), payload);
});

test("a payload with another format number is rejected", () => {
  const other = { ...payload, format: 2 };
  const file = encryptBackup(gzipSync(Buffer.from(JSON.stringify(other))), PASS);
  assert.throws(() => unpackBackup(file, PASS), BackupError);
});

test("encrypted bytes that aren't gzip'd JSON are rejected", () => {
  const file = encryptBackup(Buffer.from("not gzip"), PASS);
  assert.throws(() => unpackBackup(file, PASS), BackupError);
});

test("tables must be arrays", () => {
  const bad = { ...payload, tables: { User: "nope" } };
  const file = encryptBackup(gzipSync(Buffer.from(JSON.stringify(bad))), PASS);
  assert.throws(() => unpackBackup(file, PASS), BackupError);
});

test("tables itself must not be an array", () => {
  const bad = { ...payload, tables: [[1]] };
  const file = encryptBackup(gzipSync(Buffer.from(JSON.stringify(bad))), PASS);
  assert.throws(() => unpackBackup(file, PASS), BackupError);
});
