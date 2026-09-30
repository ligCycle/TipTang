/**
 * Load a .tipbak backup into an EMPTY, already-migrated database.
 *
 *   npm run restore -- --check '<file>'   # decrypt + show contents, touches no DB
 *   npm run restore -- '<file>'           # needs RESTORE_DATABASE_URL
 *
 * PowerShell (single quotes, so $ and other characters in the URL stay literal):
 *   $env:DIRECT_URL='<target url>'; npx prisma migrate deploy
 *   $env:RESTORE_DATABASE_URL='<target url>'; npm run restore -- '<file>'
 *
 * <target url> = the target Supabase project's connection string of the same
 * kind as DIRECT_URL (session pooler, port 5432). Special characters in the DB
 * password must be percent-encoded in the URL (e.g. @ → %40, # → %23).
 * The migrate deploy must run from code whose migrations match the backup's
 * exactly — full bad-day steps are in PROJECT.md ("กู้คืน").
 *
 * The target is never taken from .env. It refuses unless the target's
 * migrations match the backup's, every table exists, and every table is
 * empty — it never overwrites or merges. Everything runs in one transaction.
 * Needs only the file and the passphrase (not key-check.json).
 */
import { readFile } from "node:fs/promises";
import { BackupError } from "./lib/backup-crypto.ts";
import { unpackBackup, type BackupPayload } from "./lib/backup-format.ts";
import { restoreOrder } from "./lib/backup-order.ts";
import {
  appliedMigrations,
  connect,
  describeDb,
  foreignKeys,
  importTable,
  listTables,
  rowCounts,
} from "./lib/pg-backup.ts";
import { readPassphrase } from "./lib/prompt.ts";

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function printContents(p: BackupPayload) {
  console.log(`สร้างเมื่อ: ${p.createdAt}  จาก: ${p.source}`);
  console.log(`migrations: ${p.migrations.length} (ล่าสุด ${p.migrations.at(-1) ?? "-"})`);
  for (const [table, rows] of Object.entries(p.tables)) {
    console.log(`  ${table.padEnd(24)} ${rows.length}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) fail("ระบุไฟล์: npm run restore -- [--check] '<ไฟล์ .tipbak>'");

  const passphrase = await readPassphrase("รหัสผ่าน backup: ");
  let payload: BackupPayload;
  try {
    payload = unpackBackup(await readFile(file), passphrase);
  } catch (err) {
    if (err instanceof BackupError) fail(err.message);
    throw err;
  }
  printContents(payload);
  if (checkOnly) {
    console.log("\n✓ เปิดไฟล์ได้ (--check: ไม่ได้แตะฐานข้อมูล)");
    return;
  }

  const target = process.env.RESTORE_DATABASE_URL;
  if (!target) fail("ตั้ง RESTORE_DATABASE_URL เป็นฐานข้อมูลปลายทางก่อน (สคริปต์ไม่ใช้ .env)");
  console.log(`\nปลายทาง: ${describeDb(target)}`);

  const client = await connect(target);
  try {
    await client.query("BEGIN");

    const migrations = await appliedMigrations(client);
    if (JSON.stringify(migrations) !== JSON.stringify(payload.migrations)) {
      const want = payload.migrations;
      let i = 0;
      while (i < want.length && i < migrations.length && want[i] === migrations[i]) i++;
      const firstDiff =
        i < want.length
          ? `backup มี ${want[i]} แต่ปลายทาง${i < migrations.length ? `มี ${migrations[i]} แทน` : "ยังไม่มี"}`
          : `ปลายทางมี ${migrations[i]} เกินมา`;
      throw new BackupError(
        `migration ไม่ตรงกัน: ปลายทางมี ${migrations.length} ตัว, backup มี ${want.length} ตัว\n` +
          `  backup ล่าสุด:  ${want.at(-1) ?? "ไม่มี"}\n` +
          `  ปลายทางล่าสุด: ${migrations.at(-1) ?? "ไม่มี"}\n` +
          `  ต่างกันตัวแรก: ${firstDiff}\n` +
          `  → ใช้ฐานข้อมูลว่างใหม่ แล้วรัน prisma migrate deploy จากโค้ดที่ migration ล่าสุดคือ ${want.at(-1) ?? "-"} ` +
          "(ดูขั้นตอน \"กู้คืน\" ใน PROJECT.md)",
      );
    }

    const names = Object.keys(payload.tables);
    const existing = new Set(await listTables(client));
    const missing = names.filter((t) => !existing.has(t));
    if (missing.length) throw new BackupError(`ปลายทางไม่มีตาราง: ${missing.join(", ")}`);

    const before = await rowCounts(client, names);
    const notEmpty = names.filter((t) => before[t] > 0);
    if (notEmpty.length) {
      throw new BackupError(
        `ปลายทางมีข้อมูลอยู่แล้วใน ${notEmpty.join(", ")} — restore ลงได้เฉพาะฐานข้อมูลว่าง ไม่เขียนทับ`,
      );
    }

    for (const table of restoreOrder(names, await foreignKeys(client))) {
      const n = await importTable(client, table, payload.tables[table]);
      console.log(`  ${table.padEnd(24)} ${n}`);
    }

    const after = await rowCounts(client, names);
    const wrong = names.filter((t) => after[t] !== payload.tables[t].length);
    if (wrong.length) throw new BackupError(`จำนวนแถวไม่ตรงหลัง restore: ${wrong.join(", ")}`);

    await client.query("COMMIT");
    console.log("\n✓ restore เสร็จ ข้อมูลครบทุกตาราง");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    fail(`${err instanceof Error ? err.message : String(err)} — ไม่มีอะไรถูกเขียน (rollback แล้ว)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
