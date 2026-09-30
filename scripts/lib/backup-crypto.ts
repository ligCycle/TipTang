import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Backup file = MAGIC + header line (JSON) + AES-256-GCM ciphertext + 16-byte tag.
 * The key comes from the passphrase via scrypt — deliberately slow, so a stolen
 * file (or key-check.json) can't be brute-forced at SHA-256 speed. The header
 * line is fed to GCM as additional authenticated data, so editing it (salt,
 * KDF numbers) fails the same way a damaged body does.
 */

export class BackupError extends Error {}

export const MIN_PASSPHRASE = 12;
const MAGIC = Buffer.from("TIPBAK1\n", "ascii");
const TAG_BYTES = 16;
const KDF = { N: 32768, r: 8, p: 1 };
const KEY_CHECK_TEXT = "tiptang-backup-key-check-v1";

type KdfParams = { N: number; r: number; p: number };
type Header = KdfParams & { kdf: string; salt: string; iv: string };

export type KeyCheck = Header & { v: 1; ct: string; tag: string };

function deriveKey(passphrase: string, salt: Buffer, k: KdfParams): Buffer {
  // scrypt needs 128·N·r bytes; give it double so Node's limit never trips.
  return scryptSync(passphrase, salt, 32, {
    N: k.N,
    r: k.r,
    p: k.p,
    maxmem: 256 * k.N * k.r,
  });
}

function validKdf(h: Partial<Header>): h is Header {
  return (
    h.kdf === "scrypt" &&
    typeof h.salt === "string" &&
    typeof h.iv === "string" &&
    Number.isInteger(h.N) &&
    Number.isInteger(h.r) &&
    Number.isInteger(h.p) &&
    (h.N ?? 0) >= 1024 &&
    (h.N ?? 0) <= 1 << 20 &&
    (h.r ?? 0) <= 32 &&
    (h.p ?? 0) <= 16
  );
}

export function encryptBackup(plain: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const header = Buffer.from(
    JSON.stringify({
      kdf: "scrypt",
      ...KDF,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
    }) + "\n",
    "utf8",
  );
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt, KDF), iv);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, header, body, cipher.getAuthTag()]);
}

export function decryptBackup(file: Buffer, passphrase: string): Buffer {
  if (file.length < MAGIC.length || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new BackupError("ไฟล์นี้ไม่ใช่ไฟล์ backup ของ TipTang");
  }
  const nl = file.indexOf(0x0a, MAGIC.length);
  if (nl === -1) throw new BackupError("ส่วนหัวของไฟล์ backup เสียหาย");
  const header = file.subarray(MAGIC.length, nl + 1);
  let h: Partial<Header>;
  try {
    h = JSON.parse(header.toString("utf8"));
  } catch {
    throw new BackupError("ส่วนหัวของไฟล์ backup เสียหาย");
  }
  if (!validKdf(h)) throw new BackupError("ส่วนหัวของไฟล์ backup เสียหายหรือไม่รองรับ");

  const body = file.subarray(nl + 1);
  if (body.length < TAG_BYTES) throw new BackupError("ไฟล์ backup ถูกตัดหรือเสียหาย");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(passphrase, Buffer.from(h.salt, "base64"), h),
    Buffer.from(h.iv, "base64"),
  );
  decipher.setAAD(header);
  decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
  try {
    return Buffer.concat([
      decipher.update(body.subarray(0, body.length - TAG_BYTES)),
      decipher.final(),
    ]);
  } catch {
    throw new BackupError("รหัสผ่านไม่ถูกต้อง หรือไฟล์ backup เสียหาย");
  }
}

/** A small encrypted constant; opening it proves the passphrase. Holds no passphrase. */
export function makeKeyCheck(passphrase: string): KeyCheck {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt, KDF), iv);
  const ct = Buffer.concat([cipher.update(KEY_CHECK_TEXT, "utf8"), cipher.final()]);
  return {
    v: 1,
    kdf: "scrypt",
    ...KDF,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ct: ct.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function openKeyCheck(check: KeyCheck, passphrase: string): boolean {
  if (!validKdf(check)) return false;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(passphrase, Buffer.from(check.salt, "base64"), check),
      Buffer.from(check.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(check.tag, "base64"));
    const text = Buffer.concat([
      decipher.update(Buffer.from(check.ct, "base64")),
      decipher.final(),
    ]).toString("utf8");
    return text === KEY_CHECK_TEXT;
  } catch {
    return false;
  }
}
