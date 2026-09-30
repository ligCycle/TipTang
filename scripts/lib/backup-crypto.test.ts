import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BackupError,
  encryptBackup,
  decryptBackup,
  makeKeyCheck,
  openKeyCheck,
} from "./backup-crypto.ts";

const PASS = "correct horse battery";
const plain = Buffer.from("สวัสดี TipTang {\"a\":1}", "utf8");

test("round trip returns the exact bytes", () => {
  const file = encryptBackup(plain, PASS);
  assert.ok(file.subarray(0, 8).equals(Buffer.from("TIPBAK1\n")));
  assert.ok(decryptBackup(file, PASS).equals(plain));
});

test("two encryptions of the same data differ (fresh salt and IV)", () => {
  assert.ok(!encryptBackup(plain, PASS).equals(encryptBackup(plain, PASS)));
});

test("a Thai passphrase works", () => {
  const thai = "รหัสลับของทิปตัง2569";
  assert.ok(decryptBackup(encryptBackup(plain, thai), thai).equals(plain));
});

test("wrong passphrase throws BackupError", () => {
  const file = encryptBackup(plain, PASS);
  assert.throws(() => decryptBackup(file, "wrong passphrase!!"), BackupError);
});

test("one flipped byte in the body throws BackupError", () => {
  const file = Buffer.from(encryptBackup(plain, PASS));
  file[file.length - 20] ^= 0x01;
  assert.throws(() => decryptBackup(file, PASS), BackupError);
});

test("an edited header throws BackupError (header is authenticated)", () => {
  const file = encryptBackup(plain, PASS);
  const text = file.toString("latin1").replace('"p":1', '"p":2');
  assert.throws(() => decryptBackup(Buffer.from(text, "latin1"), PASS), BackupError);
});

test("truncated file and unrelated file throw BackupError", () => {
  const file = encryptBackup(plain, PASS);
  assert.throws(() => decryptBackup(file.subarray(0, 30), PASS), BackupError);
  assert.throws(() => decryptBackup(Buffer.from("PK\u0003\u0004zip"), PASS), BackupError);
  assert.throws(() => decryptBackup(Buffer.alloc(0), PASS), BackupError);
});

test("key-check opens only with the same passphrase and holds no passphrase", () => {
  const check = makeKeyCheck(PASS);
  assert.equal(openKeyCheck(check, PASS), true);
  assert.equal(openKeyCheck(check, "correct horse batterY"), false);
  assert.ok(!JSON.stringify(check).includes(PASS));
});
