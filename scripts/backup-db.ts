/**
 * Encrypted backup of every table in the production database.
 *
 *   npm run backup
 *
 * Writes tiptang-YYYY-MM-DD-HHmm.tipbak to C:\Users\<you>\OneDrive\TipTang-backups
 * (or BACKUP_DIR), checks it by decrypting it again, and keeps the 12 newest.
 * The passphrase is typed each time and never stored; key-check.json only
 * proves it's the same one as last time. Lose the passphrase = lose every backup.
 * Restore: see scripts/restore-db.ts.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BACKUP_EXT,
  backupFileName,
  daysSince,
  filesToPrune,
  newestBackup,
} from "./lib/backup-files.ts";
import {
  BackupError,
  MIN_PASSPHRASE,
  makeKeyCheck,
  openKeyCheck,
  type KeyCheck,
} from "./lib/backup-crypto.ts";
import { packBackup, unpackBackup, type BackupPayload } from "./lib/backup-format.ts";
import { connect, describeDb, readSnapshot, type Snapshot } from "./lib/pg-backup.ts";
import { readPassphrase } from "./lib/prompt.ts";

function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

async function getPassphrase(keyCheckPath: string, hasBackups: boolean): Promise<string> {
  if (!existsSync(keyCheckPath)) {
    if (hasBackups) {
      fail(
        "ไม่พบ key-check.json แต่มีไฟล์ backup อยู่แล้ว — ถ้าจะเริ่มรหัสผ่านใหม่ ให้ย้ายไฟล์ .tipbak เดิมไปไว้ที่อื่นก่อน (ไฟล์เดิมต้องใช้รหัสผ่านเดิมเปิด)",
      );
    }
    console.log(
      "ครั้งแรก: ตั้งรหัสผ่านสำหรับ backup (อย่างน้อย " +
        `${MIN_PASSPHRASE} ตัวอักษร)\n` +
        "!! ถ้าลืมรหัสนี้ จะเปิด backup ไฟล์ไหนไม่ได้อีกเลย — จดไว้ในตัวจัดการรหัสผ่าน",
    );
    const first = await readPassphrase("รหัสผ่าน: ");
    if (first.length < MIN_PASSPHRASE) {
      fail(`รหัสผ่านสั้นเกินไป (ต้องอย่างน้อย ${MIN_PASSPHRASE} ตัวอักษร)`);
    }
    const again = await readPassphrase("พิมพ์อีกครั้ง: ");
    if (again !== first) fail("รหัสผ่านสองครั้งไม่ตรงกัน — ยังไม่ได้ backup อะไร");
    await writeFile(keyCheckPath, JSON.stringify(makeKeyCheck(first), null, 2) + "\n");
    return first;
  }
  let check: KeyCheck;
  try {
    const parsed: unknown = JSON.parse(await readFile(keyCheckPath, "utf8"));
    if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
    check = parsed as KeyCheck;
  } catch {
    fail("อ่าน key-check.json ไม่ได้ (ไฟล์เสียหาย)");
  }
  const passphrase = await readPassphrase("รหัสผ่าน backup: ");
  if (!openKeyCheck(check, passphrase)) {
    fail("รหัสผ่านไม่ตรงกับ backup ชุดเดิม — ยังไม่ได้ backup อะไร");
  }
  return passphrase;
}

async function main() {
  const url = process.env.DIRECT_URL;
  if (!url) fail("ไม่พบ DIRECT_URL — รันผ่าน npm run backup (ซึ่งโหลด .env ให้)");
  const dir =
    process.env.BACKUP_DIR ?? path.join(os.homedir(), "OneDrive", "TipTang-backups");
  await mkdir(dir, { recursive: true });

  const before = await readdir(dir);
  const last = newestBackup(before);
  console.log(`โฟลเดอร์ backup: ${dir}`);
  console.log(
    last
      ? `backup ครั้งก่อน: ${daysSince(last.date, new Date())} วันที่แล้ว (${last.name})`
      : "ยังไม่เคย backup",
  );

  const passphrase = await getPassphrase(path.join(dir, "key-check.json"), last !== null);

  const name = backupFileName(new Date());
  const finalPath = path.join(dir, name);
  if (existsSync(finalPath)) fail(`มีไฟล์ ${name} อยู่แล้ว — รอสักนาทีแล้วรันใหม่`);

  console.log(`กำลังอ่านข้อมูลจาก ${describeDb(url)} ...`);
  const client = await connect(url);
  let snapshot: Snapshot;
  try {
    snapshot = await readSnapshot(client);
  } finally {
    await client.end();
  }

  const payload: BackupPayload = {
    format: 1,
    createdAt: new Date().toISOString(),
    source: describeDb(url),
    migrations: snapshot.migrations,
    tables: snapshot.tables,
  };
  const tmpPath = `${finalPath}.tmp`;
  const removeTmp = () => rm(tmpPath, { force: true }).catch(() => {});
  try {
    await writeFile(tmpPath, packBackup(payload, passphrase));
  } catch (err) {
    await removeTmp();
    throw err;
  }

  // Prove the file on disk opens and holds every row — before it gets a real
  // backup name, so an unverified file can never look like a good backup.
  try {
    const back = unpackBackup(await readFile(tmpPath), passphrase);
    for (const [table, count] of Object.entries(snapshot.counts)) {
      const got = back.tables[table]?.length ?? -1;
      if (got !== count) throw new BackupError(`${table}: ในไฟล์ ${got} แถว แต่ใน DB ${count} แถว`);
    }
  } catch (err) {
    await removeTmp();
    fail(`ตรวจไฟล์ backup ไม่ผ่าน จึงไม่ได้บันทึก: ${(err as Error).message}`);
  }

  try {
    await rename(tmpPath, finalPath);
  } catch (err) {
    await removeTmp();
    throw err;
  }

  const pruned = filesToPrune([...before, name]);
  for (const old of pruned) await rm(path.join(dir, old), { force: true });

  const size = (await readFile(finalPath)).length;
  console.log(`\n✓ backup เสร็จ: ${name} (${(size / 1024).toFixed(1)} KB)`);
  for (const [table, count] of Object.entries(snapshot.counts)) {
    console.log(`  ${table.padEnd(24)} ${count}`);
  }
  console.log(`  migrations: ${snapshot.migrations.length}`);
  if (pruned.length) console.log(`ลบ backup เก่า ${pruned.length} ไฟล์ (เก็บ 12 ไฟล์ล่าสุด)`);
  const kept = (await readdir(dir)).filter((n) => n.endsWith(BACKUP_EXT)).length;
  console.log(`ตอนนี้มี backup ${kept} ไฟล์`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
