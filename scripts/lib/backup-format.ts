import { gunzipSync, gzipSync } from "node:zlib";
import { BackupError, decryptBackup, encryptBackup } from "./backup-crypto.ts";

/** What a backup holds once decrypted. `tables` rows are Postgres row_to_json output. */
export type BackupPayload = {
  format: 1;
  createdAt: string;
  /** host:port/database the backup came from (no credentials). */
  source: string;
  /** Applied Prisma migrations, oldest first — restore requires the same list. */
  migrations: string[];
  tables: Record<string, unknown[]>;
};

function isPayload(x: unknown): x is BackupPayload {
  if (typeof x !== "object" || x === null) return false;
  const p = x as Record<string, unknown>;
  return (
    p.format === 1 &&
    typeof p.createdAt === "string" &&
    typeof p.source === "string" &&
    Array.isArray(p.migrations) &&
    p.migrations.every((m) => typeof m === "string") &&
    typeof p.tables === "object" &&
    p.tables !== null &&
    !Array.isArray(p.tables) &&
    Object.values(p.tables).every(Array.isArray)
  );
}

export function packBackup(p: BackupPayload, passphrase: string): Buffer {
  return encryptBackup(gzipSync(Buffer.from(JSON.stringify(p), "utf8")), passphrase);
}

export function unpackBackup(file: Buffer, passphrase: string): BackupPayload {
  const plain = decryptBackup(file, passphrase);
  let parsed: unknown;
  try {
    parsed = JSON.parse(gunzipSync(plain).toString("utf8"));
  } catch {
    throw new BackupError("ถอดรหัสได้ แต่ข้อมูลข้างในเสียหาย");
  }
  const format =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>).format
      : undefined;
  if (format !== 1) {
    throw new BackupError("รูปแบบไฟล์ backup ไม่รองรับ (สคริปต์นี้อ่านได้เฉพาะ format 1)");
  }
  if (!isPayload(parsed)) {
    throw new BackupError("ถอดรหัสได้ แต่ข้อมูลข้างในไม่ครบหรือผิดรูปแบบ");
  }
  return parsed;
}
