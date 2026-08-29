// Pure helpers for the Phase 5 per-player drill-down (SPEC.md §6.1 #4:
// "bet history, win rate, current streak" + the two simple charts). Kept
// separate from the page/DB code so the logic is plain and testable,
// mirroring src/lib/settlement.ts's pattern.

export type SettledStatus = "won" | "lost";

export interface StreakResult {
  type: SettledStatus | null;
  length: number;
}

/**
 * Current streak: the run of consecutive same-result settled bets ending at
 * the most recent one. `bets` must already be sorted most-recent-first
 * (only won/lost bets — a void-refunded bet doesn't count as a result and
 * should be filtered out by the caller before this runs, same as it's
 * excluded from the primary/secondary scores per §4).
 */
export function computeStreak(bets: SettledStatus[]): StreakResult {
  if (bets.length === 0) return { type: null, length: 0 };

  const type = bets[0];
  let length = 0;
  for (const status of bets) {
    if (status !== type) break;
    length++;
  }
  return { type, length };
}

/**
 * Histogram of how many bets landed on each legs-won count (0-3), for the
 * "legs-won distribution" chart. `legsWonCounts` is one entry per settled
 * (non-void-refunded) bet.
 */
export function legsWonDistribution(legsWonCounts: number[]): [number, number, number, number] {
  const buckets: [number, number, number, number] = [0, 0, 0, 0];
  for (const n of legsWonCounts) {
    if (n >= 0 && n <= 3) buckets[n]++;
  }
  return buckets;
}

export function winRate(betsWon: number, betsSettled: number): number | null {
  if (betsSettled === 0) return null;
  return (betsWon / betsSettled) * 100;
}
