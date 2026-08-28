import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { LEAGUE_CODES, PREDICTED_OUTCOMES } from "@/lib/bet-schema";
import { updateBetAction } from "./actions";

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

// The confirm screen from SPEC.md §6.1 #2: extracted fields next to the slip
// image, editable before final save. Reached right after /api/upload inserts
// the bet as pending_review.
export default async function ConfirmPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string };
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

  const { data: signedUrlData } = await supabase.storage
    .from("betslips")
    .createSignedUrl(bet.slip_image_path, 60 * 10);

  const legByNumber = new Map((legs ?? []).map((l) => [l.leg_number, l]));

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
            const leg = legByNumber.get(legNumber);
            return (
              <fieldset key={legNumber} className="space-y-3 border-t border-white/10 pt-4">
                <legend className="text-sm text-white/70 mb-1">Leg {legNumber}</legend>

                <label className="block text-sm text-white/70" htmlFor={`leg_${legNumber}_league`}>
                  League
                </label>
                <select
                  id={`leg_${legNumber}_league`}
                  name={`leg_${legNumber}_league`}
                  defaultValue={leg?.league ?? ""}
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
                      defaultValue={leg?.home_team ?? ""}
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
                      defaultValue={leg?.away_team ?? ""}
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
                  defaultValue={toLocalDatetimeInputValue(leg?.match_datetime)}
                  className="w-full min-h-[44px] rounded bg-black/40 border border-white/20 px-3 text-white"
                />

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
                      defaultValue={leg?.predicted_outcome ?? ""}
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
                      min="2.00"
                      defaultValue={leg?.odds ?? ""}
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
