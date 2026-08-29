import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { isBelowMinimumOdds } from "@/lib/bet-schema";
import { hasVoidLeg, type LegStatus } from "@/lib/settlement";
import { updateLegStatusAction, voidReconciliationAction } from "./actions";

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

const BET_STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  pending_settlement: "Awaiting result",
  won: "Won",
  lost: "Lost",
  void: "Void",
};

const BET_STATUS_STYLES: Record<string, string> = {
  pending_review: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  pending_settlement: "bg-white/10 text-white/70 border-white/20",
  won: "bg-green-500/20 text-green-300 border-green-500/40",
  lost: "bg-red-500/20 text-red-300 border-red-500/40",
  void: "bg-white/10 text-white/50 border-white/20",
};

const RECONCILIATION_LABELS: Record<string, string> = {
  standard: "Standard settlement",
  voided_full_refund: "Voided — stake refunded",
  manual_bookmaker_return: "Manual bookmaker return entered",
};

function legStatusButtonClasses(active: boolean, tone: "won" | "lost" | "void") {
  const toneActive =
    tone === "won"
      ? "border-green-500 bg-green-500/20 text-green-300"
      : tone === "lost"
      ? "border-red-500 bg-red-500/20 text-red-300"
      : "border-white/60 bg-white/10 text-white";
  return `min-h-[44px] flex-1 rounded border px-3 text-sm font-semibold transition ${
    active ? toneActive : "border-white/20 text-white/60 hover:border-white/40"
  }`;
}

// Admin bet detail — Phase 4's per-leg Won/Lost/Void controls (SPEC.md
// §3.9a) plus the §3.7a void-reconciliation control. This is the
// settlement workspace; full field-by-field amend (§6.3) beyond settlement
// fields is separate Phase 6 work.
export default async function AdminBetDetailPage({ params }: { params: { id: string } }) {
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
    .select("name, is_betfair_exchange")
    .eq("id", bet.bookmaker_id)
    .single();

  const { data: signedUrlData } = await supabase.storage
    .from("betslips")
    .createSignedUrl(bet.slip_image_path, 60 * 10);

  const legStatuses = (legs ?? []).map((l) => l.status as LegStatus);
  const isVoidPending = hasVoidLeg(legStatuses);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-accent">
            {player?.name ?? "Unknown player"}&apos;s slip — Settlement
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
        <Link href="/admin/bets" className="text-sm text-white/50 underline">
          Back to all bets
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded border border-white/10 bg-surface px-4 py-3">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            BET_STATUS_STYLES[bet.status] ?? "border-white/20 text-white/70"
          }`}
        >
          {BET_STATUS_LABELS[bet.status] ?? bet.status}
        </span>
        <span className="text-sm text-white/60">
          Stake £{Number(bet.stake).toFixed(2)} · Winnings{" "}
          {bet.winnings != null ? `£${Number(bet.winnings).toFixed(2)}` : "—"}
        </span>
        {bet.reconciliation !== "standard" && (
          <span className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70">
            {RECONCILIATION_LABELS[bet.reconciliation] ?? bet.reconciliation}
          </span>
        )}
        {isVoidPending && (
          <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-300">
            Void reconciliation needed
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
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
          {(legs ?? []).length === 0 && (
            <p className="text-sm text-yellow-300">No legs saved yet for this bet.</p>
          )}

          {(legs ?? []).map((leg) => (
            <form
              key={leg.id}
              className="space-y-3 rounded border border-white/10 bg-surface p-4"
              action={updateLegStatusAction.bind(null, leg.leg_number, leg.status as LegStatus)}
            >
              <input type="hidden" name="bet_id" value={bet.id} />

              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-white/70">Leg {leg.leg_number}</span>
                {isBelowMinimumOdds(Number(leg.odds)) && (
                  <span className="rounded bg-red-500/20 border border-red-500/50 px-2 py-0.5 text-xs font-semibold text-red-300">
                    RED FLAG — below evens
                  </span>
                )}
              </div>

              <div className="text-white">
                {leg.home_team} v {leg.away_team}
              </div>
              <div className="text-sm text-white/60">
                {LEAGUE_LABELS[leg.league] ?? leg.league} ·{" "}
                {new Date(leg.match_datetime).toLocaleString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <div className="text-sm text-white/60">
                Betting on: {OUTCOME_LABELS[leg.predicted_outcome] ?? leg.predicted_outcome} @{" "}
                {Number(leg.odds).toFixed(2)}
              </div>

              {bookmaker?.is_betfair_exchange && (
                <p className="text-xs text-white/50 italic">
                  Betfair applies its own 90-minute rule — enter the status as settled on Betfair,
                  don&apos;t work it out from the scoreline yourself (SPEC.md §3.8).
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-white/50">
                  Full-time score (home)
                  <input
                    type="number"
                    name={`leg_${leg.leg_number}_score_home_ft`}
                    defaultValue={leg.score_home_ft ?? ""}
                    className="mt-1 w-full min-h-[40px] rounded bg-black/40 border border-white/20 px-3 text-white"
                  />
                </label>
                <label className="text-xs text-white/50">
                  Full-time score (away)
                  <input
                    type="number"
                    name={`leg_${leg.leg_number}_score_away_ft`}
                    defaultValue={leg.score_away_ft ?? ""}
                    className="mt-1 w-full min-h-[40px] rounded bg-black/40 border border-white/20 px-3 text-white"
                  />
                </label>
              </div>

              <label className="block text-xs text-white/50">
                Settlement notes (optional)
                <textarea
                  name={`leg_${leg.leg_number}_settlement_notes`}
                  defaultValue={leg.settlement_notes ?? ""}
                  rows={2}
                  placeholder='e.g. "per Betfair site settlement" or "BBC full-time score used"'
                  className="mt-1 w-full rounded bg-black/40 border border-white/20 px-3 py-2 text-white text-sm"
                />
              </label>

              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  formAction={updateLegStatusAction.bind(null, leg.leg_number, "won")}
                  className={legStatusButtonClasses(leg.status === "won", "won")}
                >
                  Won
                </button>
                <button
                  type="submit"
                  formAction={updateLegStatusAction.bind(null, leg.leg_number, "lost")}
                  className={legStatusButtonClasses(leg.status === "lost", "lost")}
                >
                  Lost
                </button>
                <button
                  type="submit"
                  formAction={updateLegStatusAction.bind(null, leg.leg_number, "void")}
                  className={legStatusButtonClasses(leg.status === "void", "void")}
                >
                  Void
                </button>
              </div>
            </form>
          ))}

          {isVoidPending && (
            <form
              action={voidReconciliationAction}
              className="space-y-3 rounded border border-yellow-500/40 bg-yellow-500/5 p-4"
            >
              <input type="hidden" name="bet_id" value={bet.id} />
              <h2 className="text-sm font-semibold text-yellow-300">
                Void leg reconciliation required (SPEC.md §3.7a)
              </h2>
              <p className="text-xs text-white/60">
                A real bookmaker recalculates the bet around a void leg rather than just dropping
                it, so this app can&apos;t auto-settle the bet while any leg is Void — choose one:
              </p>

              <label className="flex items-start gap-2 text-sm text-white/80">
                <input
                  type="radio"
                  name="reconciliation_action"
                  value="void_whole_bet"
                  defaultChecked
                  className="mt-1"
                />
                <span>
                  Void the whole bet — full £{Number(bet.stake).toFixed(2)} stake refunded, excluded
                  entirely from scoring.
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm text-white/80">
                <input type="radio" name="reconciliation_action" value="manual_bookmaker_return" className="mt-1" />
                <span className="flex-1">
                  Enter the bookmaker&apos;s recalculated return:{" "}
                  <input
                    type="number"
                    step="0.01"
                    name="bookmaker_return_amount"
                    placeholder="£ amount"
                    className="ml-1 w-32 min-h-[36px] rounded bg-black/40 border border-white/20 px-2 text-white"
                  />
                </span>
              </label>

              <button
                type="submit"
                className="min-h-[44px] rounded bg-accent px-4 font-semibold text-black"
              >
                Save reconciliation
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
