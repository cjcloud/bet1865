import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { winRate } from "@/lib/player-stats";

export const dynamic = "force-dynamic";

interface RankingRow {
  player_id: string;
  name: string;
  primary_score: number;
  win_star_count: number;
  secondary_score: number;
  bets_settled: number;
  bets_won: number;
}

// betc*nt leaderboard (SPEC.md §4, §6.1 #4). player_rankings is a Postgres
// view over bets/bet_legs, always derived live — no manual recompute step —
// and already excludes any bet reconciled as voided_full_refund (§3.7a)
// from both scores and the bets-played/win-rate denominator (migration
// 0005). Sort order is set explicitly here (not left to the view's own
// default) so it's obvious at a glance what this page shows: the biggest
// betc*nt — most COTW's — sits at the top. Ties break three levels deep:
// win* count first (more wins earned only via Betfair's 90-minute rule is
// the more shameful showing, so a HIGHER win* count sits above/worse — see
// SPEC.md §3.8/§4), then Prediction Score (fewest leg wins among tied
// players is the more shameful showing, so a LOWER Prediction Score sits
// above/worse). A player with no bets recorded yet has 0/0/0 across all
// three, so a final alphabetical-by-name tiebreak (30 Aug 2026) keeps that
// group in a stable, predictable order rather than whatever incidental
// order the database happens to return for an exact tie — the moment a
// player has a bet, their scores will normally differ from 0/0/0 and the
// three score-based rules above take over as usual.
export default async function RankingPage() {
  const supabase = createClient();

  const { data: rankings } = await supabase
    .from("player_rankings")
    .select("player_id, name, primary_score, win_star_count, secondary_score, bets_settled, bets_won")
    .order("primary_score", { ascending: false })
    .order("win_star_count", { ascending: false })
    .order("secondary_score", { ascending: true })
    .order("name", { ascending: true })
    .returns<RankingRow[]>();

  const rows = rankings ?? [];
  const maxPrimary = Math.max(1, ...rows.map((r) => r.primary_score));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-accent">betc*nt Ranking</h1>
        <p className="text-white/70">
          See the{" "}
          <Link href="/rules" className="underline hover:text-accent">
            rules
          </Link>{" "}
          for how this is scored.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-white/50 text-sm">No players found.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-white/10 bg-surface">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/50">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium text-right">
                  betc*nt
                  <div className="text-[10px] font-normal normal-case text-white/40">(COTW&apos;s)</div>
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  Win*
                  <div className="text-[10px] font-normal normal-case text-white/40">(90-min wins)</div>
                </th>
                <th className="px-4 py-3 font-medium text-right">Prediction Score</th>
                <th className="px-4 py-3 font-medium text-right">Played</th>
                <th className="px-4 py-3 font-medium text-right">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const rate = winRate(row.bets_won, row.bets_settled);
                return (
                  <tr key={row.player_id} className="border-b border-white/5 last:border-b-0">
                    <td className="px-4 py-3 text-white/50">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/player/${row.player_id}`}
                        className="font-medium text-white hover:text-accent"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="font-semibold text-white">{row.primary_score}</span>
                        <span
                          aria-hidden
                          className="h-2 rounded-full bg-red-400/70"
                          style={{
                            width: `${Math.max(4, (row.primary_score / maxPrimary) * 48)}px`,
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-white/60">{row.win_star_count}</td>
                    <td className="px-4 py-3 text-right text-white/80">{row.secondary_score}</td>
                    <td className="px-4 py-3 text-right text-white/60">{row.bets_settled}</td>
                    <td className="px-4 py-3 text-right text-white/60">
                      {rate === null ? "—" : `${rate.toFixed(0)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-white/40">
        Tap a player&apos;s name for their full bet history, current streak, and charts.
      </p>
    </div>
  );
}
