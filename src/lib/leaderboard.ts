import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type Supporter = { name: string; total: number };

/**
 * Supporters ranked by confirmed total.
 *
 * Grouped on a NORMALIZED key, not the raw name: supporters have no
 * account and retype their name on every tip, so "Skye" / "skye" /
 * "Skye " are one person. We fold case + whitespace + invisible chars
 * ONLY. We deliberately do NOT fold Thai tone marks — they change the
 * word (ขาว != ข้าว), so folding them would credit one donor's money
 * to another. Prisma groupBy can only group by a raw column, so this
 * has to be raw SQL.
 *
 * NOTE the DOUBLE backslashes: this is a tagged template, so JS eats
 * one layer first. Postgres receives ​ / \s and reads them as
 * regex escapes. A single backslash would silently reach Postgres as
 * a bare "s" and collapse the letter s instead of whitespace.
 *
 * `publicOnly` — the public donate page only ranks supporters who opted
 * in (`isMessagePublic`). The creator's own dashboard sees everyone,
 * because it already lists every name in the tip rows.
 * `since` — count only tips created at/after this instant (dashboard
 * range filter). Null/undefined = all time.
 */
export async function topSupporters(
  creatorId: string,
  opts: { limit: number; publicOnly: boolean; since?: Date | null },
): Promise<Supporter[]> {
  const rows = await prisma.$queryRaw<{ display: string; total: string }[]>`
      SELECT
        -- Show the spelling they used most recently, minus any stray
        -- leading combining mark (same reasoning as the GROUP BY below):
        -- it is a typing slip that renders as a floating mark, so there
        -- is no reason to print it back at them.
        regexp_replace(
          (array_agg("supporterName"
             ORDER BY COALESCE("confirmedAt", "createdAt") DESC))[1],
          '^[\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E]+', '') AS display,
        SUM("amount")::text AS total
      FROM "Tip"
      WHERE "creatorId" = ${creatorId}
        AND "status" = 'CONFIRMED'
        ${opts.publicOnly ? Prisma.sql`AND "isMessagePublic" = true` : Prisma.empty}
        ${opts.since ? Prisma.sql`AND "createdAt" >= ${opts.since}` : Prisma.empty}
        AND btrim("supporterName") <> ''
      GROUP BY lower(regexp_replace(
        btrim(regexp_replace(
          regexp_replace(normalize("supporterName", NFC),
                         '\\u200B|\\u200C|\\u200D|\\uFEFF', '', 'g'),
          '\\s+', ' ', 'g')),
        -- Drop Thai combining marks stranded at the START of the name.
        -- A tone mark or above/below vowel must sit ON a consonant; one in
        -- position 0 has nothing to combine with, so it is always a typo
        -- artifact and dropping it cannot change the word. (This is NOT the
        -- same as folding tone marks generally, which we refuse to do.)
        -- Leading vowels เ แ โ ใ ไ (U+0E40-44) are real and stay.
        '^[\\u0E31\\u0E34-\\u0E3A\\u0E47-\\u0E4E]+', ''))
      -- Tie-break so equal totals keep a stable order across renders
      -- (whoever reached that total first ranks higher). Without this the
      -- leaderboard reshuffles on every refresh.
      ORDER BY SUM("amount") DESC,
               MIN(COALESCE("confirmedAt", "createdAt")) ASC
      LIMIT ${opts.limit}
    `;

  return (
    rows
      .map((g) => ({ name: g.display, total: Number(g.total) }))
      // A name made ONLY of stray combining marks strips down to nothing.
      // That supporter is indistinguishable from anonymous, and the query
      // already keeps anonymous tips off the leaderboard — so drop it here
      // too rather than rendering a blank row.
      .filter((s) => s.name !== "")
  );
}
