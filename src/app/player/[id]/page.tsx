import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { computeStreak, legsWonDistribution, winRate, type SettledStatus } from "@/lib/player-stats";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  pending_settlement: "Awaiting result",
  won: "Won",
  lost: "Lost",
  void: "Void",
};

const STATUS_STYLES: Record<string, string> = {
  pending_review: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  pending_settlement: "bg-white/10 text-white/70 border-white/20",
  won: "bg-green-500/20 text-green-300 border-green-500/40",
  lost: "bg-red-500/20 text-red-300 border-red-500/40",
  void: "bg-white/10 text-white/50 border-white/20",
};

const ACCENT = "#ffb80c";

// A thin, single-series step line: cumulative betc*nt (primary score) after
// each settled bet, in date order. Single hue per the dataviz method (one
// series needs no legend/categorical palette) — plain server-rendered SVG,
// no client JS, with a native <title> per point standing in for a hover
// tooltip (proportionate for a private 6-player app).
function PrimaryScoreOverTimeChart({ cumulative }: { cumulative: number[] }) {
  if (cumulative.length === 0) {
    return <p className="text-sm text-white/40">No settled bets yet.</p>;
  }

  const width = 320;
  const height = 96;
  const padding = 12;
  const maxY = Math.max(1, ...cumulative);
  const stepX = cumulative.length > 1 ? (width - padding * 2) / (cumulative.length - 1) : 0;

  const points = cumulative.map((v, i) => {
    const x = padding + i * stepX;
    const y = height - padding - (v / maxY) * (height - padding * 2);
    return { x, y, v };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-sm" role="img" aria-label="betc*nt count over time">
      {/* recessive baseline */}
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      <path d={path} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3.5 : 2} fill={ACCENT}>
          <title>{`Bet ${i + 1}: betc*nt ${p.v}`}</title>
        </circle>
      ))}
      <text
        x={points[points.length - 1].x}
        y={Math.max(10, points[points.length - 1].y - 8)}
        textAnchor="end"
        fontSize={11}
        fill="#f5f5f5"
      >
        {cumulative[cumulative.length - 1]}
      </text>
    </svg>
  );
}

// Bar histogram of legs-won-per-bet (0-3). Single series -> single hue,
// direct value labels on top of each bar, category labels below.
function LegsWonDistributionChart({ buckets }: { buckets: [number, number, number, number] }) {
  const width = 240;
  const height = 96;
  const padding = 12;
  const gap = 10;
  const barWidth = (width - padding * 2 - gap * 3) / 4;
  const maxCount = Math.max(1, ...buckets);

  return (
    <svg viewBox={`0 0 ${width} ${height + 16}`} className="w-full max-w-xs" role="img" aria-label="Legs won per bet">
      {buckets.map((count, i) => {
        const barHeight = (count / maxCount) * (height - padding * 2);
        const x = padding + i * (barWidth + gap);
        const y = height - padding - barHeight;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, count > 0 ? 3 : 0)} rx={4} fill={ACCENT}>
              <title>{`${count} bet${count === 1 ? "" : "s"} with ${i} leg${i === 1 ? "" : "s"} won`}</title>
            </rect>
            <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="#f5f5f5">
              {count}
            </text>
            <text x={x + barWidth / 2} y={height + 12} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.5)">
              {i}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default async function PlayerDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: player } = await supabase.from("players").select("id, name").eq("id", params.id).single();
  if (!player) notFound();

  const { data: bets } = await supabase
    .from("bets")
    .select("id, bet_date, status, reconciliation, winnings, stake, bookmaker_id, created_at")
    .eq("player_id", params.id)
    .order("bet_date", { ascending: true })
    .order("created_at", { ascending: true });

  const allBets = bets ?? [];

  const bookmakerIds = Array.from(new Set(allBets.map((b) => b.bookmaker_id)));
  const { data: bookmakers } = bookmakerIds.length
    ? await supabase.from("bookmakers").select("id, name").in("id", bookmakerIds)
    : { data: [] as { id: string; name: string }[] };
  const bookmakerNameById = new Map((bookmakers ?? []).map((b) => [b.id, b.name]));

  const betIds = allBets.map((b) => b.id);
  const { data: legs } = betIds.length
    ? await supabase.from("bet_legs").select("bet_id, status").in("bet_id", betIds)
    : { data: [] as { bet_id: string; status: string }[] };

  const legsWonByBet = new Map<string, number>();
  for (const leg of legs ?? []) {
    if (leg.status === "won") {
      legsWonByBet.set(leg.bet_id, (legsWonByBet.get(leg.bet_id) ?? 0) + 1);
    }
  }

  // Scored bets = settled, and not fully voided-with-refund (§3.7a, §4) -
  // matches the player_rankings view exactly, so these stats agree with the
  // Ranking page's numbers for this player.
  const scoredBets = allBets.filter(
    (b) => (b.status === "won" || b.status === "lost") && b.reconciliation !== "voided_full_refund"
  );

  const betsWon = scoredBets.filter((b) => b.status === "won").length;
  const betsSettled = scoredBets.length;
  const rate = winRate(betsWon, betsSettled);

  const streakInputs: SettledStatus[] = [...scoredBets].reverse().map((b) => b.status as SettledStatus);
  const streak = computeStreak(streakInputs);

  let running = 0;
  const cumulativePrimary = scoredBets.map((b) => {
    if (b.status === "lost") running += 1;
    return running;
  });

  const buckets = legsWonDistribution(scoredBets.map((b) => legsWonByBet.get(b.id) ?? 0));

  // Mirrors the player_rankings view's secondary_score formula exactly
  // (SPEC.md §4): +1 per leg won across scored bets, +2 bonus per clean
  // sweep (3/3). Computed locally from the same scoredBets/legsWonByBet
  // already built above rather than a second round trip to the view.
  const predictionScore = scoredBets.reduce((sum, b) => {
    const legsWon = legsWonByBet.get(b.id) ?? 0;
    return sum + legsWon + (legsWon === 3 ? 2 : 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-accent">{player.name}</h1>
        <Link href="/" className="text-sm text-white/50 underline">
          Back to Ranking
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded border border-white/10 bg-surface px-3 py-2">
          <div className="text-xs text-white/50">Bets played</div>
          <div className="text-lg font-semibold text-white">{betsSettled}</div>
        </div>
        <div className="rounded border border-white/10 bg-surface px-3 py-2">
          <div className="text-xs text-white/50">Win rate</div>
          <div className="text-lg font-semibold text-white">{rate === null ? "—" : `${rate.toFixed(0)}%`}</div>
        </div>
        <div className="rounded border border-white/10 bg-surface px-3 py-2">
          <div className="text-xs text-white/50">Current streak</div>
          <div className="text-lg font-semibold text-white">
            {streak.type ? `${streak.length}${streak.type === "won" ? "W" : "L"}` : "—"}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-surface px-3 py-2">
          <div className="text-xs text-white/50">betc*nt (COTW&apos;s)</div>
          <div className="text-lg font-semibold text-white">
            {cumulativePrimary[cumulativePrimary.length - 1] ?? 0}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-surface px-3 py-2">
          <div className="text-xs text-white/50">Prediction Score</div>
          <div className="text-lg font-semibold text-white">{predictionScore}</div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Bet history</h2>
        {allBets.length === 0 ? (
          <p className="text-sm text-white/50">No bets uploaded for {player.name} yet.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-white/10 bg-surface">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/50">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Bookmaker</th>
                  <th className="px-4 py-3 font-medium text-right">Legs won</th>
                  <th className="px-4 py-3 font-medium text-right">Winnings</th>
                  <th className="px-4 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...allBets].reverse().map((bet) => (
                  <tr key={bet.id} className="border-b border-white/5 last:border-b-0">
                    <td className="px-4 py-3">
                      <Link href={`/bets/${bet.id}`} className="text-white hover:text-accent">
                        {new Date(bet.bet_date).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {bookmakerNameById.get(bet.bookmaker_id) ?? "Unknown"}
                    </td>
                    <td className="px-4 py-3 text-right text-white/70">
                      {legsWonByBet.get(bet.id) ?? 0}/3
                    </td>
                    <td className="px-4 py-3 text-right text-white/70">
                      {bet.winnings != null ? `£${Number(bet.winnings).toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          STATUS_STYLES[bet.status] ?? "border-white/20 text-white/70"
                        }`}
                      >
                        {STATUS_LABELS[bet.status] ?? bet.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded border border-white/10 bg-surface p-4">
          <h2 className="mb-2 text-sm font-medium text-white/70">betc*nt count over time</h2>
          <PrimaryScoreOverTimeChart cumulative={cumulativePrimary} />
        </div>
        <div className="rounded border border-white/10 bg-surface p-4">
          <h2 className="mb-2 text-sm font-medium text-white/70">Legs won per bet</h2>
          <LegsWonDistributionChart buckets={buckets} />
        </div>
      </div>
    </div>
  );
}
