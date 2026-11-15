/**
 * Quick-pick amount chips on the donate form. Pure, no "server-only" import —
 * so it runs under `node --test`.
 */

const QUICK_AMOUNTS = [20, 50, 100, 200, 500];

/**
 * Chips that respect the creator's minimum. A minimum below the first chip
 * (but above 1) becomes the first chip, so a creator who takes 10 baht shows
 * a 10 button instead of looking like the floor is 20. If the standard set is
 * mostly wiped out by a high minimum, offer multiples of the minimum instead
 * so the row never ends up empty.
 */
export function quickAmountsFor(min: number): number[] {
  if (min > 1 && min < QUICK_AMOUNTS[0]) return [min, ...QUICK_AMOUNTS];
  const kept = QUICK_AMOUNTS.filter((a) => a >= min);
  return kept.length >= 3 ? kept : [min, min * 2, min * 5, min * 10];
}
