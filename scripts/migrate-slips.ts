/**
 * One-off: move legacy donation slips from the PUBLIC uploads bucket into the
 * PRIVATE slip bucket and point Tip.slipKey at them.
 *
 *   node --env-file=.env scripts/migrate-slips.ts            # dry run (default)
 *   node --env-file=.env scripts/migrate-slips.ts --apply    # do it
 *
 * Touches production storage AND the database — run it with a human watching.
 * Sequential on purpose (one file at a time) so Supabase Storage is never
 * hammered and the log reads top to bottom. Safe to re-run: rows that already
 * have slipKey are skipped, and the private upload uses upsert.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicBucket = process.env.SUPABASE_BUCKET || "uploads";
const slipBucket = process.env.SUPABASE_SLIP_BUCKET || "slips";
if (!url || !serviceKey) throw new Error("Supabase env is missing");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const marker = `/object/public/${publicBucket}/`;

async function main() {
  const rows = await prisma.tip.findMany({
    where: { slipUrl: { not: null }, slipKey: null },
    select: { id: true, slipUrl: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${apply ? "APPLY" : "DRY RUN"} — ${rows.length} tip(s) with a legacy public slip`);

  let moved = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const src = row.slipUrl ?? "";
    const idx = src.indexOf(marker);
    if (idx === -1) {
      console.log(`skip   ${row.id}  (not in ${publicBucket}: ${src.slice(0, 60)})`);
      skipped++;
      continue;
    }
    const key = decodeURIComponent(src.slice(idx + marker.length));
    if (!apply) {
      console.log(`would  ${row.id}  ${key}`);
      moved++;
      continue;
    }
    try {
      const dl = await supabase.storage.from(publicBucket).download(key);
      if (dl.error || !dl.data) throw new Error(`download: ${dl.error?.message}`);
      const bytes = Buffer.from(await dl.data.arrayBuffer());
      const up = await supabase.storage
        .from(slipBucket)
        .upload(key, bytes, { contentType: dl.data.type || undefined, upsert: true });
      if (up.error) throw new Error(`upload: ${up.error.message}`);
      await prisma.tip.update({
        where: { id: row.id },
        data: { slipKey: key, slipUrl: null },
      });
      // Only after the row points at the private copy do we drop the public one.
      const rm = await supabase.storage.from(publicBucket).remove([key]);
      if (rm.error) console.log(`warn   ${row.id}  public copy not removed: ${rm.error.message}`);
      console.log(`moved  ${row.id}  ${key}`);
      moved++;
    } catch (e) {
      console.log(`FAILED ${row.id}  ${(e as Error).message}`);
      failed++;
    }
  }

  console.log(`done — moved ${moved}, skipped ${skipped}, failed ${failed}`);
  await prisma.$disconnect();
}

main();
