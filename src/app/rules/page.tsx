// Renders SPEC.md §3-4 for players (Phase 5 task 2). Static content for v1
// (per BUILD_TEST_DEPLOY_PLAN.md: "static MDX is fine for v1") rather than
// pulled from the DB — the wording is copied from the spec's canonical
// rules/scoring sections, with the dev-facing "Parked"/migration notes left
// out since those aren't part of the game as players experience it. Any
// change to SPEC.md §3-4 should be mirrored here (SPEC.md's own instruction).
export default function RulesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-accent">Rules</h1>
        <p className="text-white/70">How the game works, and how the betc*nt table is scored.</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">The game</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-white/80 marker:text-accent">
          <li>Each week, one of the six players places a <strong>treble</strong> (3-leg accumulator) bet.</li>
          <li>
            All three legs must be football matches from the English top-flight domestic pyramid:
            Premier League, EFL Championship, EFL League One, EFL League Two.
          </li>
          <li>
            Each leg is intended to be priced at <strong>evens (2.0) or better</strong> at the time
            the bet is placed — but every slip is accepted and recorded exactly as it reads. A leg
            priced below evens is red-flagged for admin attention, never blocked or dropped.
          </li>
          <li>Stake is fixed at <strong>£10</strong> per bet.</li>
          <li>Once placed, the player uploads a screenshot of the bet slip to the app.</li>
          <li>
            <strong>Settlement:</strong> once the admin has registered each leg&apos;s result:
            <ul className="mt-2 list-disc space-y-1 pl-5 marker:text-accent">
              <li>If <strong>any leg loses</strong>, the whole bet loses — winnings are £0.</li>
              <li>
                If <strong>all three legs win</strong>, winnings are the return amount printed on
                the bet slip (not recalculated from odds).
              </li>
              <li>
                If <strong>any leg is void</strong> (postponed, abandoned, or voided by the
                bookmaker), the bet is reconciled by hand — either voided in full (stake refunded,
                excluded from scoring) or settled at the bookmaker&apos;s own recalculated return.
              </li>
            </ul>
          </li>
          <li>
            <strong>Betfair Exchange special case</strong> — applies only to legs placed with
            Betfair Exchange. Betfair settles in-play bets on the match state at the 90-minute mark
            (end of normal time): a leg winning at 90 minutes stays a win even if the score changes
            again in stoppage time, and a leg losing at 90 minutes but ahead by full time is still
            settled as a win. Every other bookmaker settles on the plain full-time result — no
            90-minute nuance applies.
          </li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Scoring — the betc*nt table</h2>
        <p className="text-sm text-white/70">
          Every player starts at 0/0. Two scores are tracked. The Ranking table lists players by
          betc*nt count, highest first — that&apos;s your number of COTW&apos;s — with Prediction
          Score breaking a tie: a higher betc*nt count means lower betting acumen, so on a tie the
          player with the <em>lower</em> Prediction Score (the worse predictor) ranks above the
          one with the higher Prediction Score.
        </p>

        <div className="rounded border border-white/10 bg-surface p-4">
          <h3 className="font-medium text-white">betc*nt count (your number of COTW&apos;s)</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70 marker:text-accent">
            <li>+1 every time a recorded bet ultimately loses.</li>
            <li>Unaffected by wins.</li>
            <li>
              A bet voided in full (stake refunded) is excluded entirely — as if it never happened.
            </li>
          </ul>
        </div>

        <div className="rounded border border-white/10 bg-surface p-4">
          <h3 className="font-medium text-white">Prediction Score (tiebreaker)</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/70 marker:text-accent">
            <li>
              Breaks a tie between players level on betc*nt count — the lower Prediction Score
              ranks above the higher one, in keeping with a higher position meaning lower success.
            </li>
            <li>+1 for every individual leg that wins, across all bets (0-3 per bet).</li>
            <li>
              +2 bonus on any bet where all three legs win — a clean-sweep bet is worth +5 in
              total.
            </li>
            <li>A void leg contributes neither a win nor a loss to this count.</li>
          </ul>
        </div>

        <div className="overflow-x-auto rounded border border-white/10 bg-surface">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="px-4 pt-3 text-left text-xs text-white/50">Worked example</caption>
            <thead>
              <tr className="border-b border-white/10 text-white/50">
                <th className="px-4 py-2 font-medium">Bet</th>
                <th className="px-4 py-2 font-medium">Legs won</th>
                <th className="px-4 py-2 font-medium">Result</th>
                <th className="px-4 py-2 font-medium text-right">betc*nt</th>
                <th className="px-4 py-2 font-medium text-right">Prediction Score</th>
              </tr>
            </thead>
            <tbody className="text-white/80">
              <tr className="border-b border-white/5">
                <td className="px-4 py-2">1</td>
                <td className="px-4 py-2">3/3</td>
                <td className="px-4 py-2">Won</td>
                <td className="px-4 py-2 text-right">+0</td>
                <td className="px-4 py-2 text-right">+5</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="px-4 py-2">2</td>
                <td className="px-4 py-2">2/3</td>
                <td className="px-4 py-2">Lost</td>
                <td className="px-4 py-2 text-right">+1</td>
                <td className="px-4 py-2 text-right">+2</td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="px-4 py-2">3</td>
                <td className="px-4 py-2">0/3</td>
                <td className="px-4 py-2">Lost</td>
                <td className="px-4 py-2 text-right">+1</td>
                <td className="px-4 py-2 text-right">+0</td>
              </tr>
              <tr>
                <td className="px-4 py-2">4</td>
                <td className="px-4 py-2">3/3</td>
                <td className="px-4 py-2">Won</td>
                <td className="px-4 py-2 text-right">+0</td>
                <td className="px-4 py-2 text-right">+5</td>
              </tr>
            </tbody>
          </table>
          <p className="px-4 pb-3 pt-2 text-xs text-white/50">
            Totals after 4 bets: betc*nt count = 2, Prediction Score = 12.
          </p>
        </div>
      </section>
    </div>
  );
}
