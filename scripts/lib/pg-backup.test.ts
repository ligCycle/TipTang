import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteIdent, describeDb, readSnapshot, type Queryable } from "./pg-backup.ts";

test("quoteIdent quotes plain names and rejects anything odd", () => {
  assert.equal(quoteIdent("User"), '"User"');
  assert.equal(quoteIdent("_prisma_migrations"), '"_prisma_migrations"');
  assert.throws(() => quoteIdent('User"; DROP TABLE "Tip'));
  assert.throws(() => quoteIdent("1abc"));
});

test("describeDb shows host, port and database but never credentials", () => {
  const url = "postgresql://postgres.abc:s3cret-pass@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require";
  const d = describeDb(url);
  assert.equal(d, "aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres");
  assert.ok(!d.includes("s3cret"));
  assert.equal(describeDb("not a url"), "(URL ไม่ถูกต้อง)");
});

test("readSnapshot does every read inside one REPEATABLE READ transaction", async () => {
  const sql: string[] = [];
  const fake = {
    async query(text: string) {
      sql.push(text);
      if (text.includes("to_regclass")) return { rows: [{ ok: true }], rowCount: 1 };
      if (text.includes("migration_name")) return { rows: [{ migration_name: "m1" }], rowCount: 1 };
      if (text.includes("information_schema.tables")) {
        return { rows: [{ table_name: "Tip" }, { table_name: "User" }], rowCount: 2 };
      }
      if (text.includes("count(*)")) return { rows: [{ n: 1 }], rowCount: 1 };
      if (text.includes("json_agg")) return { rows: [{ rows: [{ id: "x" }] }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Queryable;

  const snap = await readSnapshot(fake);

  assert.equal(sql[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(sql[sql.length - 1], "COMMIT");
  assert.deepEqual(snap.migrations, ["m1"]);
  assert.deepEqual(snap.counts, { Tip: 1, User: 1 });
  assert.deepEqual(snap.tables, { Tip: [{ id: "x" }], User: [{ id: "x" }] });
});
