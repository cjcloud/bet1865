import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { isBelowMinimumOdds } from "@/lib/bet-schema";

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

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  pending_settlement: "Awaiting result",
  won: "Won",
  lost: "Lost",
  void: "Void",
};

// Same colour scheme as /bets, /admin/bets, /admin/bets/[id], and
// /player/[id] — green for a win, red for a loss, kept neutral otherwise.
const STATUS_STYLES: Record<string, string> = {
  pending_review: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  pending_settlement: "bg-white/10 text-white/70 border-white/20",
  won: "bg-green-500/20 text-green-300 border-green-500/40",
  lost: "bg-red-500/20 text-red-300 border-red-500/40",
  void: "bg-white/10 text-white/50 border-white/20",
};

const LEG_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  won: "Won",
  lost: "Lost",
  void: "Void",
};

const LEG_STATUS_STYLES: Record<string, string> = {
  pending: "bg-white/10 text-white/70 border-white/20",
  won: "bg-green-500/20 text-green-300 border-green-500/40",
  lost: "bg-red-500/20 text-red-300 border-red-500/40",
  void: "bg-white/10 text-white/50 border-white/20",
};

// Read-only view of one uploaded slip for general visitors (SPEC.md §6.1
// #3 — reached from /bets when browsing by player). Editing/settlement is
// admin-only, under /admin, so this page has no edit/upload links. Slip
// image needs the admin client: the betslips Storage bucket is
// service-role-only (SPEC.md §6.2), so signed URLs can't be minted with
// the public anon client.
export default async function BetDetailPage({ params }: { params: { id: string } }) {
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

  const { data: signedUrlData } = await supabase.storage
    .from("betslips")
    .createSignedUrl(bet.slip_image_path, 60 * 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-accent">
            {player?.name ?? "Unknown player"}&apos;s slip
          </h1>
          <p className="text-white/70">
            {bookmaker?.name ?? "Unknown bookmaker"} ·{" "}
            {new Date(bet.bet_date).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            STATUS_STYLES[bet.status] ?? "border-white/20 text-white/80"
          }`}
        >
          {STATUS_LABELS[bet.status] ?? bet.status}
        </span>
      </div>

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

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded border border-white/10 bg-surface px-3 py-2">
              <div className="text-white/50">Stake</div>
              <div className="text-lg font-semibold text-white">£{Number(bet.stake).toFixed(2)}</div>
            </div>
            <div className="rounded border border-white/10 bg-surface px-3 py-2">
              <div className="text-white/50">Potential return</div>
              <div className="text-lg font-semibold text-white">
                £{Number(bet.slip_return_amount).toFixed(2)}
              </div>
            </div>
          </div>

          {(legs ?? []).length === 0 && (
            <p className="text-sm text-yellow-300">
              No legs saved for this bet yet — check back once the admin has finished entering it.
            </p>
          )}

          {(legs ?? []).map((leg) => {
            // Selection name, Betfair-slip style: the team actually backed
            // (or "Draw"), not just "home v away" — mirrors how the
            // Betfair app itself labels each leg of a settled bet.
            const pickLabel =
              leg.predicted_outcome === "HOME_WIN"
                ? leg.home_team
                : leg.predicted_outcome === "AWAY_WIN"
                ? leg.away_team
                : "Draw";
            const hasFullTimeScore = leg.score_home_ft !== null && leg.score_away_ft !== null;

            return (
              <div key={leg.id} className="rounded-lg border border-white/10 bg-surface p-4 space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/40">
                  Leg {leg.leg_number}
                </div>

                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-base font-bold text-white">{pickLabel}</span>
                    <span className="whitespace-nowrap text-base font-bold text-white">
                      @ {Number(leg.odds).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-white/50">{LEAGUE_LABELS[leg.league] ?? leg.league}</span>
                    <div className="flex items-center gap-2">
                      {isBelowMinimumOdds(Number(leg.odds)) && (
                        <span className="rounded bg-red-500/20 border border-red-500/50 px-2 py-0.5 text-xs font-semibold text-red-300">
                          RED FLAG — below evens
                        </span>
                      )}
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          LEG_STATUS_STYLES[leg.status] ?? "border border-white/20 text-white/70"
                        }`}
                      >
                        {LEG_STATUS_LABELS[leg.status] ?? leg.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Fixture card, Betfair-slip style: home/away stacked on the
                    left, an "FT" full-time score in green boxes on the right
                    once the admin has entered one (SPEC.md — score_home_ft /
                    score_away_ft are optional, admin's own record-keeping). */}
                <div className="flex items-center justify-between gap-3 rounded-md bg-black/30 p-3">
                  <div className="space-y-2 text-sm text-white">
                    <div>{leg.home_team}</div>
                    <div>{leg.away_team}</div>
                  </div>
                  {hasFullTimeScore && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-green-400">FT</span>
                      <div className="flex flex-col gap-1">
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-green-600 text-sm font-bold text-white">
                          {leg.score_home_ft}
                        </span>
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-green-600 text-sm font-bold text-white">
                          {leg.score_away_ft}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-xs text-white/50">
                  Prediction: {OUTCOME_LABELS[leg.predicted_outcome] ?? leg.predicted_outcome} ·{" "}
                  {new Date(leg.match_datetime).toLocaleString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            );
          })}

        </div>
      </div>

      <div className="pt-2">
        <Link
          href="/bets"
          className="inline-flex min-h-[44px] items-center rounded border border-white/20 px-4 font-medium text-white/80 hover:border-white/40"
        >
          View all slips
        </Link>
      </div>
    </div>
  );
}
