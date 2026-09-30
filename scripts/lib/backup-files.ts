/**
 * Names, ages and retention for backup files. Pure — no file system access,
 * so the rules are unit-tested; the scripts do the actual reading/deleting.
 */

export const BACKUP_EXT = ".tipbak";
/** ≈3 months of weekly backups; older ones would keep deleted accounts' data. */
export const KEEP_BACKUPS = 12;

const NAME = /^tiptang-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.tipbak$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** `tiptang-YYYY-MM-DD-HHmm.tipbak` in the machine's local time. */
export function backupFileName(d: Date): string {
  return (
    `tiptang-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${BACKUP_EXT}`
  );
}

/** The time encoded in a backup's name; null for any other file. */
export function parseBackupDate(name: string): Date | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

/**
 * Dated backups, newest first. Dates come from the file name, not the file's
 * mtime — OneDrive re-syncs can change mtimes.
 */
function datedBackups(names: string[]): { name: string; date: Date }[] {
  const out: { name: string; date: Date }[] = [];
  for (const name of names) {
    const date = parseBackupDate(name);
    if (date) out.push({ name, date });
  }
  return out.sort(
    (a, b) => b.date.getTime() - a.date.getTime() || b.name.localeCompare(a.name),
  );
}

export function newestBackup(
  names: string[],
): { name: string; date: Date } | null {
  return datedBackups(names)[0] ?? null;
}

/** Whole days between two moments (0 if `then` is in the future). */
export function daysSince(then: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / DAY_MS));
}

/** Backups beyond the newest `keep`. Files that aren't backups are never listed. */
export function filesToPrune(names: string[], keep = KEEP_BACKUPS): string[] {
  return datedBackups(names)
    .slice(keep)
    .map((b) => b.name);
}
