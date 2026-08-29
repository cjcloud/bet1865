import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { LEAGUE_CODES, PREDICTED_OUTCOMES, isBelowMinimumOdds } from "@/lib/bet-schema";
import { competitionLeagueCode, type CompetitionSlug } from "@/lib/api-football";
import { updateBetAction, lookupFixtureAction, chooseFixtureAction } from "./actions";

export const dynamic = "force-dynamic";

const LEAGUE_LABELS: Record<string, string> = {
  PL: "Premier League",
  CHAMPIONSHIP: "Championship",
  LEAGUE_ONE: "League One",
  LEAGUE_TWO: "League Two",
};

const OUTCOME_LABELS: Record<string, string> = {
  HOME_WIN: "Home win",
  AWAY_WIN: "Away win",
  DRAW: "Draw",
};

function toLocalDatetimeInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

function formatKickoff(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// The confirm screen from SPEC.md §6.1 #2: extracted fields next to the slip
// image, editable before final save. Reached right after /api/upload inserts
// the bet as pending_review.
export default async function ConfirmPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string; fixtureSearch?: string; fixtureError?: string };
}) {
  const supabase = createAdminClient();

  const { data: bet } = await supabase.from("bets").select("*").eq("id", params.id).single();
  if (!bet) notFound();

  const { data: legs } = await supabase
    .from("bet_legs")
    .select("*")
    .eq("bet_id", params.id)
    .order("leg_number");

  const { data: fixtureCandidates } = await supabase
    .from("bet_leg_fixture_candidates")
    .select("*")
    .eq("bet_id", params.id)
    .order("kickoff");

  const { data: player } = await supabase.from("players").select("name").eq("id", bet.player_id).single();
  const { data: bookmaker } = await supabase
    .from("bookmakers")
    .select("name")
    .eq("id", bet.bookmaker_id)
    .single();

  const { data: signedUrlData } = await supabase.storage
    .from("betslips")
    .createSignedUrl(bet.slip_image_path, 60 * 10);

  const legByNumber = new Map((legs ?? []).map((l) => [l.leg_number, l]));

  type FixtureCandidateRow = {
    external_fixture_id: string;
    competition_slug: string;
    competition_label: string;
    home_team: string;
    away_team: string;
    kickoff: string;
    venue: string | null;
    chosen: boolean;
  };
  const candidatesByLeg = new Map<number, FixtureCandidateRow[]>();
  for (const c of (fixtureCandidates ?? []) as unknown as (FixtureCandidateRow & { leg_number: number })[]) {
    const arr = candidatesByLeg.get(c.leg_number) ?? [];
    arr.push(c);
    candidatesByLeg.set(c.leg_number, arr);
  }

  // A leg that failed validation (e.g. missing kick-off time) is never
  // written to bet_legs (SPEC.md §5's NOT NULL constraints would reject it),
  // but the AI may still have read the teams/league/odds correctly, or a
  // fixture may since have been looked up and chosen (SPEC.md §3.12).
  // Preference order: saved bet_legs row > a chosen fixture candidate > the
  // raw AI extraction — so the form is always pre-filled with the best
  // available source, and only genuine gaps need filling in by hand.
  type AiLeg = {
    leg_number?: number | null;
    league?: string | null;
    home_team?: string | null;
    away_team?: string | null;
    match_datetime?: string | null;
    predicted_outcome?: string | null;
    odds?: number | null;
  };
  const aiLegs: AiLeg[] =
    (bet.ai_raw_response as { parsed?: { legs?: AiLeg[] } } | null)?.parsed?.legs ?? [];
  const aiLegByNumber = new Map(aiLegs.map((l, i) => [l.leg_number ?? i + 1, l]));

  function chosenCandidate(legNumber: number) {
    return candidatesByLeg.get(legNumber)?.find((c) => c.chosen) ?? null;
  }

  function legField<K extends keyof AiLeg>(legNumber: number, key: K): AiLeg[K] | null {
    const saved = legByNumber.get(legNumber);
    if (saved && saved[key] != null) return saved[key];

    const chosen = chosenCandidate(legNumber);
    if (chosen) {
      if (key === "league") {
        const mapped = competitionLeagueCode(chosen.competition_slug as CompetitionSlug);
        if (mapped) return mapped as AiLeg[K];
      } else if (key === "home_team") {
        return chosen.home_team as AiLeg[K];
      } else if (key === "away_team") {
        return chosen.away_team as AiLeg[K];
      } else if (key === "match_datetime") {
        return chosen.kickoff as AiLeg[K];
      }
    }

    const fromAi = aiLegByNumber.get(legNumber);
    return fromAi?.[key] ?? null;
  }

  function legExternalFixtureId(legNumber: number): string {
    const saved = legByNumber.get(legNumber);
    if (saved?.external_fixture_id) return saved.external_fixture_id;
    return chosenCandidate(legNumber)?.external_fixture_id ?? "";
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-accent">Check the details</h1>
      <p className="text-white/70">
        {player?.name ?? "Unknown player"} · {bookmaker?.name ?? "Unknown bookmaker"} — fix anything the
        automatic reading got wrong, then save.
      </p>

      {searchParams.saved && (
        <div className="rounded border border-accent/50 bg-accent/10 px-4 py-3 text-accent">
          Saved. You can keep editing below, or you&apos;re done —{" "}
          <Link href="/ranking" className="underline">
            view the ranking
          </Link>{" "}
          or{" "}
          <Link href="/upload" className="underline">
            upload another slip
          </Link>
          .
        </div>
      )}

      {bet.admin_notes && (
        <div className="rounded border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
          {bet.admin_notes}
        </div>
      )}

      {bet.ai_raw_response && (
        <details className="rounded border border-white/20 bg-black/30 px-4 py-3 text-sm text-white/70">
          <summary className="cursor-pointer text-white/90">
            Debug: what Claude actually returned (Phase 3 testing — remove before real launch)
          </summary>
          <pre className="mt-3 whitespace-pre-wrap break-words text-xs">
            {JSON.stringify(bet.ai_raw_response, null, 2)}
          </pre>
        </details>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {signedUrlData?.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signedUrlData.signedUrl}
              alt="Bet slip"
              className="w-full rounded border border-white/20"
            />
          ) : (
            <p className="text-white/50 text-sm">Slip image unavailable.</p>
          )}
        </div>

        {/* One form, multiple submit buttons via formAction (SPEC.md §3.12):
            "Save", "Find fixture" per leg, and "Use this fixture" per
            candidate all read/write the SAME live-typed field values —
            no nested forms, no client JS needed. */}
        <form action={updateBetAction} className="space-y-6">
          <input type="hidden" name="bet_id" value={bet.id} />

          <fieldset className="space-y-3">
            <legend className="text-sm text-white/70 mb-1">Bet details</legend>
            <label className="block text-sm text-white/70" htmlFor="bet_date">
              Date
            </label>
            <input
              id="bet_date"
              name="bet_date"
              type="date"
              defaultValue={bet.bet_date}
              className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-white/70" htmlFor="stake">
                  Stake (£)
                </label>
                <input
                  id="stake"
                  name="stake"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={bet.stake}
                  className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-white/70" htmlFor="slip_return_amount">
                  Potential return (£)
                </label>
                <input
                  id="slip_return_amount"
                  name="slip_return_amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={bet.slip_return_amount}
                  className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                />
              </div>
            </div>
          </fieldset>

          {[1, 2, 3].map((legNumber) => {
            const league = legField(legNumber, "league");
            const homeTeam = legField(legNumber, "home_team");
            const awayTeam = legField(legNumber, "away_team");
            const matchDatetime = legField(legNumber, "match_datetime");
            const predictedOutcome = legField(legNumber, "predicted_outcome");
            const odds = legField(legNumber, "odds");
            const pendingCandidates = (candidatesByLeg.get(legNumber) ?? []).filter((c) => !c.chosen);
            const justSearched = searchParams.fixtureSearch === String(legNumber);

            return (
              <fieldset key={legNumber} className="space-y-3 border-t border-white/10 pt-4">
                <legend className="flex items-center gap-2 text-sm text-white/70 mb-1">
                  <span>Leg {legNumber}</span>
                  {typeof odds === "number" && isBelowMinimumOdds(odds) && (
                    <span className="rounded bg-red-500/20 border border-red-500/50 px-2 py-0.5 text-xs font-semibold text-red-300">
                      RED FLAG — below evens (odds {odds.toFixed(2)})
                    </span>
                  )}
                </legend>

                <label className="block text-sm text-white/70" htmlFor={`leg_${legNumber}_league`}>
                  League
                </label>
                <select
                  id={`leg_${legNumber}_league`}
                  name={`leg_${legNumber}_league`}
                  defaultValue={league ?? ""}
                  className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                >
                  <option value="">—</option>
                  {LEAGUE_CODES.map((code) => (
                    <option key={code} value={code}>
                      {LEAGUE_LABELS[code]}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-white/70" htmlFor={`leg_${legNumber}_home_team`}>
                      Home team
                    </label>
                    <input
                      id={`leg_${legNumber}_home_team`}
                      name={`leg_${legNumber}_home_team`}
                      type="text"
                      defaultValue={homeTeam ?? ""}
                      className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/70" htmlFor={`leg_${legNumber}_away_team`}>
                      Away team
                    </label>
                    <input
                      id={`leg_${legNumber}_away_team`}
                      name={`leg_${legNumber}_away_team`}
                      type="text"
                      defaultValue={awayTeam ?? ""}
                      className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                    />
                  </div>
                </div>

                <label className="block text-sm text-white/70" htmlFor={`leg_${legNumber}_match_datetime`}>
                  Kick-off
                </label>
                <input
                  id={`leg_${legNumber}_match_datetime`}
                  name={`leg_${legNumber}_match_datetime`}
                  type="datetime-local"
                  defaultValue={toLocalDatetimeInputValue(matchDatetime)}
                  className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                />
                <input
                  type="hidden"
                  name={`leg_${legNumber}_external_fixture_id`}
                  value={legExternalFixtureId(legNumber)}
                />

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    formAction={lookupFixtureAction.bind(null, legNumber)}
                    className="min-h-[44px] rounded border border-accent/60 px-3 text-sm font-medium text-accent hover:bg-accent/10"
                  >
                    Find fixture (next 7 days)
                  </button>
                  {justSearched && !searchParams.fixtureError && pendingCandidates.length === 0 && (
                    <span className="text-xs text-white/50">No fixture found in that window — enter it manually above.</span>
                  )}
                </div>

                {justSearched && searchParams.fixtureError && (
                  <p className="text-xs text-red-400">
                    Fixture lookup failed: {searchParams.fixtureError}
                  </p>
                )}

                {pendingCandidates.length > 0 && (
                  <div className="rounded border border-accent/40 bg-accent/5 p-3 space-y-2">
                    <p className="text-xs text-white/70">
                      {pendingCandidates.length > 1
                        ? "More than one match fits — which one is this?"
                        : "Found a match — use it?"}
                    </p>
                    {pendingCandidates.map((c) => (
                      <div
                        key={c.external_fixture_id}
                        className="flex items-center justify-between gap-3 rounded bg-black/30 px-3 py-2"
                      >
                        <div className="text-sm">
                          <div className="text-white">
                            {c.home_team} v {c.away_team}
                          </div>
                          <div className="text-white/60 text-xs">
                            {c.competition_label} · {formatKickoff(c.kickoff)}
                            {c.venue ? ` · ${c.venue}` : ""}
                          </div>
                        </div>
                        <button
                          type="submit"
                          formAction={chooseFixtureAction.bind(null, legNumber, c.external_fixture_id)}
                          className="min-h-[36px] shrink-0 rounded bg-accent px-3 text-xs font-semibold text-black"
                        >
                          Use this fixture
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      className="block text-sm text-white/70"
                      htmlFor={`leg_${legNumber}_predicted_outcome`}
                    >
                      Predicted outcome
                    </label>
                    <select
                      id={`leg_${legNumber}_predicted_outcome`}
                      name={`leg_${legNumber}_predicted_outcome`}
                      defaultValue={predictedOutcome ?? ""}
                      className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                    >
                      <option value="">—</option>
                      {PREDICTED_OUTCOMES.map((code) => (
                        <option key={code} value={code}>
                          {OUTCOME_LABELS[code]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-white/70" htmlFor={`leg_${legNumber}_odds`}>
                      Odds
                    </label>
                    <input
                      id={`leg_${legNumber}_odds`}
                      name={`leg_${legNumber}_odds`}
                      type="number"
                      step="0.01"
                      min="0.01"
                      defaultValue={odds ?? ""}
                      className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                    />
                  </div>
                </div>
              </fieldset>
            );
          })}

          <button
            type="submit"
            className="min-h-[44px] w-full rounded bg-accent text-black font-semibold px-4"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
