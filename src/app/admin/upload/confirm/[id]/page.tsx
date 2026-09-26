import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { LEAGUE_CODES, PREDICTED_OUTCOMES, isBelowMinimumOdds } from "@/lib/bet-schema";
import { updateBetAction, setNearestSaturdayAction } from "./actions";

export const dynamic = "force-dynamic";

const LEAGUE_LABELS: Record<string, string> = {
  PL: "Premier League",
  CHAMPIONSHIP: "Championship",
  LEAGUE_ONE: "League One",
  LEAGUE_TWO: "League Two",
  FA_CUP: "FA Cup",
  EFL_CUP: "EFL Cup (Carabao Cup)",
};

const OUTCOME_LABELS: Record<string, string> = {
  HOME_WIN: "Home win",
  AWAY_WIN: "Away win",
  DRAW: "Draw",
};

const SETTLED_STATUSES = new Set(["won", "lost", "void"]);
const BET_STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  pending_settlement: "Awaiting result",
  won: "Won",
  lost: "Lost",
  void: "Void",
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

// The confirm screen from SPEC.md §6.1 #2: extracted fields next to the slip
// image, editable before final save. Admin-only (see middleware.ts) — reached
// right after /api/admin/upload inserts the bet as pending_review, or from
// Admin's bet detail page when re-editing an already-saved bet.
export default async function ConfirmPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: {
    saved?: string;
    legIssues?: string;
    suggestLeg?: string;
    formState?: string;
  };
}) {
  const supabase = createAdminClient();

  const { data: bet } = await supabase.from("bets").select("*").eq("id", params.id).single();
  if (!bet) notFound();

  const { data: legs } = await supabase
    .from("bet_legs")
    .select("*")
    .eq("bet_id", params.id)
    .order("leg_number");

  const { data: player } = await supabase.from("players").select("name").eq("id", bet.player_id).single();
  const { data: bookmaker } = await supabase
    .from("bookmakers")
    .select("name")
    .eq("id", bet.bookmaker_id)
    .single();

  // Full lists so the amend form can reassign either — SPEC.md §6.3's
  // "amend any bet-level field" includes correcting a slip recorded
  // against the wrong player or bookmaker, not just fixing what the AI
  // misread on the legs.
  const { data: allPlayers } = await supabase.from("players").select("id, name").order("name");
  const { data: allBookmakers } = await supabase.from("bookmakers").select("id, name").order("name");

  const { data: signedUrlData } = await supabase.storage
    .from("betslips")
    .createSignedUrl(bet.slip_image_path, 60 * 10);

  const legByNumber = new Map((legs ?? []).map((l) => [l.leg_number, l]));

  // A leg that failed validation (e.g. missing kick-off time) is never
  // written to bet_legs (SPEC.md §5's NOT NULL constraints would reject it),
  // but the AI may still have read the teams/league/odds correctly.
  // Preference order: saved bet_legs row > the raw AI extraction — so the
  // form is always pre-filled with the best available source, and only
  // genuine gaps need filling in by hand.
  type AiLeg = {
    leg_number?: number | null;
    league?: string | null;
    home_team?: string | null;
    away_team?: string | null;
    match_datetime?: string | null;
    predicted_outcome?: string | null;
    odds?: number | null;
    odds_fraction?: string | null;
  };
  const aiLegs: AiLeg[] =
    (bet.ai_raw_response as { parsed?: { legs?: AiLeg[] } } | null)?.parsed?.legs ?? [];
  const aiLegByNumber = new Map(aiLegs.map((l, i) => [l.leg_number ?? i + 1, l]));

  function legField<K extends keyof AiLeg>(legNumber: number, key: K): AiLeg[K] | null {
    const saved = legByNumber.get(legNumber);
    if (saved && saved[key] != null) return saved[key];

    const fromAi = aiLegByNumber.get(legNumber);
    return fromAi?.[key] ?? null;
  }

  // Carries the WHOLE form's last-submitted state across a "Set to nearest
  // Saturday, 3pm" redirect (see the long comment on setNearestSaturdayAction
  // in actions.ts for why this exists) - every field the browser last had,
  // not just the one leg that button just changed. Takes priority over the
  // DB/AI fallbacks in legField() whenever present, since it reflects
  // something the uploader is actively mid-edit on this page right now.
  type FormStateLeg = {
    league?: string;
    home_team?: string;
    away_team?: string;
    match_datetime?: string;
    predicted_outcome?: string;
    odds?: string;
  };
  let formState: {
    bet_date?: string;
    stake?: string;
    slip_return_amount?: string;
    legs?: Record<string, FormStateLeg>;
  } = {};
  if (searchParams.formState) {
    try {
      formState = JSON.parse(decodeURIComponent(searchParams.formState));
    } catch {
      formState = {};
    }
  }
  function formLeg(legNumber: number): FormStateLeg | undefined {
    return formState.legs?.[String(legNumber)];
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-accent">Check the details</h1>
      <p className="text-white/70">
        {player?.name ?? "Unknown player"} · {bookmaker?.name ?? "Unknown bookmaker"} — fix anything the
        automatic reading got wrong, then save.
      </p>

      {(() => {
        let legIssues: string[] = [];
        if (searchParams.legIssues) {
          try {
            legIssues = JSON.parse(decodeURIComponent(searchParams.legIssues));
          } catch {
            legIssues = [];
          }
        }
        if (legIssues.length > 0) {
          return (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 space-y-2">
              <p className="font-semibold">
                Bet details saved, but not every leg could be — fix these and save again:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                {legIssues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          );
        }
        if (searchParams.saved) {
          return (
            <div className="rounded border border-accent/50 bg-accent/10 px-4 py-3 text-accent">
              Saved. You can keep editing below, or you&apos;re done —{" "}
              <Link href="/ranking" className="underline">
                view the ranking
              </Link>{" "}
              or{" "}
              <Link href="/admin/upload" className="underline">
                upload another slip
              </Link>
              .
            </div>
          );
        }
        return null;
      })()}

      {SETTLED_STATUSES.has(bet.status) && (
        <div className="rounded border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-white/80">
          This bet is already settled ({BET_STATUS_LABELS[bet.status] ?? bet.status}). You can still
          correct anything here — the player, bookmaker, stake, potential return, or any leg&apos;s
          details — even after settlement (SPEC.md &sect;6.3). Saving will re-check the settled
          winnings against a corrected stake/return figure automatically. To change a leg&apos;s
          Won/Lost/Void result itself, use{" "}
          <Link href={`/admin/bets/${bet.id}`} className="underline">
            Settle
          </Link>{" "}
          instead.
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

        {/* One form, multiple submit buttons via formAction: "Save" and,
            per leg, "Set to nearest Saturday, 3pm" both read/write the SAME
            live-typed field values — no nested forms, no client JS needed. */}
        <form action={updateBetAction} className="space-y-6">
          <input type="hidden" name="bet_id" value={bet.id} />

          <fieldset className="space-y-3">
            <legend className="text-sm text-white/70 mb-1">Bet details</legend>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-white/70" htmlFor="player_id">
                  Player
                </label>
                <select
                  id="player_id"
                  name="player_id"
                  defaultValue={bet.player_id}
                  className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                >
                  {(allPlayers ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-white/70" htmlFor="bookmaker_id">
                  Bookmaker
                </label>
                <select
                  id="bookmaker_id"
                  name="bookmaker_id"
                  defaultValue={bet.bookmaker_id}
                  className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                >
                  {(allBookmakers ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="block text-sm text-white/70" htmlFor="bet_date">
              Date
            </label>
            <input
              id="bet_date"
              name="bet_date"
              type="date"
              defaultValue={formState.bet_date || bet.bet_date}
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
                  defaultValue={formState.stake || bet.stake}
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
                  defaultValue={formState.slip_return_amount || bet.slip_return_amount}
                  className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                />
              </div>
            </div>

            <label className="block text-sm text-white/70" htmlFor="admin_notes">
              Admin notes (optional)
            </label>
            <textarea
              id="admin_notes"
              name="admin_notes"
              defaultValue={bet.admin_notes ?? ""}
              rows={2}
              placeholder="e.g. reason for a correction, for future reference"
              className="w-full rounded bg-black/40 border border-white/20 px-3 py-2 text-white text-sm"
            />
          </fieldset>

          {[1, 2, 3].map((legNumber) => {
            const fs = formLeg(legNumber);
            const league = fs?.league || legField(legNumber, "league") || "";
            const homeTeam = fs?.home_team || legField(legNumber, "home_team") || "";
            const awayTeam = fs?.away_team || legField(legNumber, "away_team") || "";
            const predictedOutcome = fs?.predicted_outcome || legField(legNumber, "predicted_outcome") || "";
            const odds = fs?.odds || legField(legNumber, "odds") || "";
            // Display-only - the fraction as originally printed on the
            // slip (migration 0009), carried through to bet_legs on Save
            // so the bet detail pages can show the true original price
            // rather than a fraction re-derived from the rounded decimal
            // (which can land on a different, if similarly simple,
            // fraction - see SPEC.md §3.11). Never edited directly; the
            // admin only edits the decimal "Odds" field above.
            const oddsFraction = legField(legNumber, "odds_fraction") || "";

            // A "Set to nearest Saturday, 3pm" click redirects back here
            // with the WHOLE form's state (including this leg's suggested
            // kick-off) in `formState` — it's only ever a starting guess
            // (SPEC.md §3.12a: automated lookup is parked, most fixtures
            // are Saturday 3pm anyway), never written to bet_legs until the
            // admin actually hits Save.
            const kickoffDefaultValue =
              fs?.match_datetime || toLocalDatetimeInputValue(legField(legNumber, "match_datetime"));
            const justSuggested = searchParams.suggestLeg === String(legNumber);

            return (
              <fieldset key={legNumber} className="space-y-3 border-t border-white/10 pt-4">
                <legend className="flex items-center gap-2 text-sm text-white/70 mb-1">
                  <span>Leg {legNumber}</span>
                  {odds !== "" && Number.isFinite(Number(odds)) && isBelowMinimumOdds(Number(odds)) && (
                    <span className="rounded bg-red-500/20 border border-red-500/50 px-2 py-0.5 text-xs font-semibold text-red-300">
                      RED FLAG — below evens (odds {Number(odds).toFixed(2)})
                    </span>
                  )}
                </legend>

                <label className="block text-sm text-white/70" htmlFor={`leg_${legNumber}_league`}>
                  League
                </label>
                <select
                  id={`leg_${legNumber}_league`}
                  name={`leg_${legNumber}_league`}
                  defaultValue={league}
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
                      defaultValue={homeTeam}
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
                      defaultValue={awayTeam}
                      className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                    />
                  </div>
                </div>

                <label className="block text-sm text-white/70" htmlFor={`leg_${legNumber}_match_datetime`}>
                  Kick-off
                </label>
                <input
                  key={kickoffDefaultValue}
                  id={`leg_${legNumber}_match_datetime`}
                  name={`leg_${legNumber}_match_datetime`}
                  type="datetime-local"
                  defaultValue={kickoffDefaultValue}
                  className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    formAction={setNearestSaturdayAction.bind(null, legNumber)}
                    className="min-h-[44px] rounded border border-accent/60 px-3 text-sm font-medium text-accent hover:bg-accent/10"
                  >
                    Set to nearest Saturday, 3pm
                  </button>
                  {justSuggested && (
                    <span className="text-xs text-white/50">
                      Just a starting guess — check it against the actual fixture and adjust if needed.
                    </span>
                  )}
                </div>

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
                      defaultValue={predictedOutcome}
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
                      defaultValue={odds}
                      className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                    />
                    <input type="hidden" name={`leg_${legNumber}_odds_fraction`} value={oddsFraction} />
                    {oddsFraction && (
                      <p className="mt-1 text-xs text-white/40">
                        As printed on the slip: {oddsFraction} — change the decimal above if this is wrong,
                        the fraction shown to players will update to match.
                      </p>
                    )}
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
