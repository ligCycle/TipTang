import pg from "pg";
import type { ForeignKey } from "./backup-order.ts";

/**
 * The only file that talks to Postgres. All type conversion is left to
 * Postgres: row_to_json on the way out, json_populate_recordset on the way
 * in, so timestamps, decimals, enums and JSON columns come back exactly.
 */

export type Queryable = Pick<pg.Client, "query">;

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Table names come from the database/backup file — only plain identifiers are allowed. */
export function quoteIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`ชื่อตารางแปลก ๆ: ${JSON.stringify(name)}`);
  return `"${name}"`;
}

/** host:port/database — safe to print (no user, no password). */
export function describeDb(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(URL ไม่ถูกต้อง)";
  }
}

export async function connect(url: string): Promise<pg.Client> {
  // Supabase requires TLS, and its certificate chain isn't in Node's default
  // store — same setting as the repo's other DB scripts. A URL that says
  // sslmode=disable (local Prisma Dev) still turns TLS off: values parsed
  // from the connection string override this object.
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

/** Data tables in `public`, alphabetical. `_prisma_migrations` is schema, not data. */
export async function listTables(c: Queryable): Promise<string[]> {
  const r = await c.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name`,
  );
  return r.rows.map((x) => String(x.table_name));
}

/** Successfully applied migrations, oldest first; [] when the DB was never migrated. */
export async function appliedMigrations(c: Queryable): Promise<string[]> {
  const exists = await c.query(
    `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS ok`,
  );
  if (!exists.rows[0]?.ok) return [];
  const r = await c.query(
    `SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name`,
  );
  return r.rows.map((x) => String(x.migration_name));
}

export async function rowCounts(
  c: Queryable,
  tables: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) {
    const r = await c.query(`SELECT count(*)::int AS n FROM ${quoteIdent(t)}`);
    out[t] = Number(r.rows[0]?.n ?? 0);
  }
  return out;
}

async function exportTable(c: Queryable, table: string): Promise<unknown[]> {
  const r = await c.query(
    `SELECT coalesce(json_agg(row_to_json(t)), '[]'::json) AS rows FROM ${quoteIdent(table)} t`,
  );
  const rows = r.rows[0]?.rows;
  return Array.isArray(rows) ? rows : [];
}

export type Snapshot = {
  migrations: string[];
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

/**
 * Read everything at one instant: a REPEATABLE READ transaction sees a single
 * snapshot, so a tip that arrives mid-backup can't reference a user the file
 * doesn't have, and the counts match the exported rows exactly.
 */
export async function readSnapshot(c: Queryable): Promise<Snapshot> {
  await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const migrations = await appliedMigrations(c);
    const names = await listTables(c);
    const counts = await rowCounts(c, names);
    const tables: Record<string, unknown[]> = {};
    for (const t of names) tables[t] = await exportTable(c, t);
    return { migrations, counts, tables };
  } finally {
    // Read-only: COMMIT and ROLLBACK are equivalent (and COMMIT on an
    // aborted transaction just rolls it back).
    await c.query("COMMIT");
  }
}

export async function foreignKeys(c: Queryable): Promise<ForeignKey[]> {
  const r = await c.query(
    `SELECT src.relname AS tbl, dst.relname AS ref
       FROM pg_constraint k
       JOIN pg_class src ON src.oid = k.conrelid
       JOIN pg_class dst ON dst.oid = k.confrelid
      WHERE k.contype = 'f' AND k.connamespace = 'public'::regnamespace`,
  );
  return r.rows.map((x) => ({ table: String(x.tbl), references: String(x.ref) }));
}

/**
 * Insert a table's rows in one statement. json_populate_recordset casts each
 * JSON field to the column's real type. One statement per table is fine at
 * today's size (the parameter limit is ~1 GB); past ~50 MB switch to chunks
 * of 1,000 rows inside the same transaction.
 */
export async function importTable(
  c: Queryable,
  table: string,
  rows: unknown[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const q = quoteIdent(table);
  const r = await c.query(
    `INSERT INTO ${q} SELECT * FROM json_populate_recordset(NULL::${q}, $1::json)`,
    [JSON.stringify(rows)],
  );
  return r.rowCount ?? 0;
}
