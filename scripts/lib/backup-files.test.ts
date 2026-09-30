import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backupFileName,
  parseBackupDate,
  newestBackup,
  daysSince,
  filesToPrune,
} from "./backup-files.ts";

test("backupFileName uses local date and time, zero-padded", () => {
  assert.equal(
    backupFileName(new Date(2026, 8, 3, 7, 5)),
    "tiptang-2026-09-03-0705.tipbak",
  );
});

test("parseBackupDate round-trips backupFileName and rejects anything else", () => {
  const d = new Date(2026, 8, 30, 18, 30);
  assert.equal(parseBackupDate(backupFileName(d))?.getTime(), d.getTime());
  assert.equal(parseBackupDate("key-check.json"), null);
  assert.equal(parseBackupDate("tiptang-2026-09-30-1830.tipbak.tmp"), null);
  assert.equal(parseBackupDate("desktop.ini"), null);
});

test("newestBackup picks the latest dated file and ignores others", () => {
  const names = [
    "tiptang-2026-09-01-0900.tipbak",
    "key-check.json",
    "tiptang-2026-09-30-1830.tipbak",
    "tiptang-2026-09-15-2000.tipbak",
  ];
  assert.equal(newestBackup(names)?.name, "tiptang-2026-09-30-1830.tipbak");
  assert.equal(newestBackup(["key-check.json"]), null);
});

test("daysSince counts whole days and never goes negative", () => {
  const then = new Date(2026, 8, 21, 18, 0);
  assert.equal(daysSince(then, new Date(2026, 8, 30, 17, 59)), 8);
  assert.equal(daysSince(then, new Date(2026, 8, 30, 18, 0)), 9);
  assert.equal(daysSince(then, new Date(2026, 8, 20)), 0);
});

test("filesToPrune keeps the 12 newest backups and never lists other files", () => {
  const backups = Array.from({ length: 14 }, (_, i) =>
    backupFileName(new Date(2026, 6, 1 + i * 7, 12, 0)),
  );
  const names = ["key-check.json", "desktop.ini", "notes.txt", ...backups];
  const pruned = filesToPrune(names);
  assert.deepEqual(pruned.sort(), [backups[0], backups[1]].sort());
  assert.deepEqual(filesToPrune(names, 20), []);
});
