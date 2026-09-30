# Encrypted database backup + restore — design

**Date:** 2026-09-30 · **Status:** approved in conversation

## Why

TipTang's only copy of its data is the production Supabase Postgres (17.6, ~12 MB: 22 users,
41 tips). If the project is paused/deleted, a migration goes wrong, or rows are deleted by
mistake, creators' accounts and tip history are gone. The founder wants a backup they run
themselves, stored where it survives a dead laptop, without putting users' personal data
(emails, password hashes, PromptPay IDs) on a cloud drive in the clear — and a restore that is
proven to work, not just assumed.

## Decisions (from the conversation)

- **Where:** `C:\Users\ggtan\OneDrive\TipTang-backups\` — synced by OneDrive (off-machine copy),
  outside the repo so a backup can never be committed. Override with `BACKUP_DIR`.
- **Encrypted** with a passphrase typed at run time (never stored, never in `.env`).
- **When:** manual, `npm run backup`. No scheduler; each run prints how many days since the
  previous backup.
- **What:** every table in the `public` schema (data) + the list of applied migrations.
  Supabase Storage files (avatars, slips, alert media) are out of scope.
- **No new dependencies:** `pg` (already installed) + Node's `crypto` / `zlib`. No `pg_dump`.

## Format

Export: per table `SELECT coalesce(json_agg(row_to_json(t)), '[]') FROM "<table>" t` — Postgres
renders every type itself (TIMESTAMP(3) as ISO without zone, NUMERIC exact, JSON columns
nested, enums as text), so nothing is converted in JavaScript.

Payload (before encryption), gzip'd JSON:

```json
{ "format": 1, "createdAt": "<ISO>", "source": "<host>/<db>",
  "migrations": ["20260716…_init", …],
  "tables": { "User": [ … ], "Tip": [ … ], … } }
```

`_prisma_migrations` is not in `tables` — the schema is rebuilt from the repo's migrations.

File `tiptang-YYYY-MM-DD-HHmm.tipbak` (local time): ASCII magic `TIPBAK1\n`, then a JSON header
line `{ "kdf": "scrypt", "N": 32768, "r": 8, "p": 1, "salt": b64, "iv": b64 }\n`, then the
AES-256-GCM ciphertext followed by the 16-byte auth tag. Fresh random salt (16 B) and IV (12 B)
per file. The key is `scrypt(passphrase, salt, 32, {N, r, p})`. Any tampering or a wrong
passphrase fails the GCM tag check — there is no "decrypts to garbage" case.

## Passphrase + key-check

- Minimum 12 characters. Read from the terminal with echo off; when stdin is not a TTY (tests)
  it is read from the first line of stdin.
- `key-check.json` in the backup folder: `{ "salt", "iv", "ct", "tag" }` — AES-256-GCM of the
  constant `"tiptang-backup-key-check-v1"` under a scrypt key from its own salt. It holds **no
  passphrase and no hash that is fast to brute-force** (scrypt, not plain/salted SHA-256, which
  is billions of guesses per second).
- First run (no key-check): ask twice, must match, then write key-check. Later runs: ask once,
  refuse to back up unless it opens key-check — so every backup in the folder shares one
  passphrase and a typo can never produce an unreadable backup.
- Lost passphrase = every backup is unreadable. Said on first run and in the README note.

## `npm run backup` (`node --env-file=.env scripts/backup-db.ts`)

1. Print the age of the newest existing `.tipbak`, taken from its file name, not its mtime
   (OneDrive re-syncs can change mtimes) — "ครั้งก่อน: 9 วันที่แล้ว" / "first backup".
2. Passphrase (as above).
3. Connect with `DIRECT_URL`; read table list from `information_schema.tables` (public, base
   tables), row counts, and migration names (`_prisma_migrations` where `finished_at` is not
   null and `rolled_back_at` is null, ordered).
4. Export, gzip, encrypt, write to `<name>.tipbak.tmp`, then rename (never a half-written file).
5. **Verify:** read the file back, decrypt, gunzip, and compare every table's row count with
   step 3. Mismatch → delete the file, exit 1.
6. Prune: keep the 12 newest `.tipbak` files (≈3 months weekly), delete older ones — old
   backups would otherwise keep data of accounts deleted since.
7. Print file name, size, per-table counts.

## `npm run restore -- <file> [--check]` (`scripts/restore-db.ts`)

- Needs only the file and the passphrase — not `key-check.json` — so a restore works on a new
  machine after the old one is gone.
- `--check`: decrypt and print metadata + per-table counts. Touches no database.
- Otherwise the target is **only** `RESTORE_DATABASE_URL` (never `DATABASE_URL`/`DIRECT_URL`
  implicitly), printed (password masked) before anything happens.
- Preconditions, each a hard stop with a clear message:
  1. Target's applied migrations equal the backup's list (run `prisma migrate deploy` on the
     empty target first).
  2. Every table being restored is empty in the target — restore never overwrites or merges.
  3. Every table in the backup exists in the target.
- Insert order: topological sort of foreign keys read from the target (`pg_constraint`,
  contype `f`), so parents (User) load before children (Tip, ShopOrder…); self-references and
  unknown tables fail loudly.
- Per table: `INSERT INTO "<t>" SELECT * FROM json_populate_recordset(NULL::"<t>", $1::json)` —
  Postgres casts the JSON back to the exact column types.
- All tables in **one transaction**; any error rolls back everything.
- Afterwards compare row counts with the backup and print them.
- Size note: one statement per table is fine at today's size (JSON param limit is ~1 GB). If a
  backup ever passes ~50 MB, switch to 1,000-row chunks inside the same transaction.

## Code layout

- `scripts/lib/backup-crypto.ts` — pure: `encryptBackup`, `decryptBackup`, `makeKeyCheck`,
  `openKeyCheck` (scrypt + AES-256-GCM, Buffer in/out).
- `scripts/lib/backup-order.ts` — pure: `restoreOrder(tables, foreignKeys)`.
- `scripts/lib/backup-files.ts` — pure-ish helpers: file naming, "days since", prune selection.
- `scripts/lib/prompt.ts` — hidden passphrase input (TTY) / first stdin line (non-TTY).
- `scripts/backup-db.ts`, `scripts/restore-db.ts` — thin orchestration.
- `package.json`: `"backup"`, `"restore"`; the `test` glob gains `"scripts/**/*.test.ts"`.

## Testing

- Unit (`node --test`): encrypt→decrypt round trip; wrong passphrase fails; one flipped byte
  fails; key-check opens with the right passphrase only; restore order puts parents first and
  rejects a cycle; prune keeps exactly the 12 newest; file-name/day-count helpers.
- End-to-end, **local only**: two throwaway `npx prisma dev` databases, both migrated; seed the
  first through the app's own API (users, tips with slips, a shop item/order, reports, JSON
  social links, NULLs, decimals, Thai text); `backup` from it; `restore` into the second; then
  compare every table row-for-row (`row_to_json` ordered by id) — must be identical. Also:
  restore into a non-empty target refuses; wrong passphrase refuses; tampered file refuses;
  mismatched migrations refuse.
- Production is never touched by the tests. The founder runs the first real `npm run backup`.

## Out of scope

Supabase Storage files; scheduled/unattended backups; restoring a single table or user.
