"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { LEAGUE_CODES, PREDICTED_OUTCOMES } from "@/lib/bet-schema";

// Saves the uploader's corrections from the confirm screen (SPEC.md §6.1 #2:
// "a lightweight 'does this look right?' confirm step"). Uses the admin
// client because writes to bets/bet_legs are service-role-only per RLS
// (SPEC.md §6.2) — this server action is the one sanctioned path in from a
// public, unauthenticated page.
export async function updateBetAction(formData: FormData) {
  const betId = formData.get("bet_id");
  if (typeof betId !== "string" || !betId) throw new Error("Missing bet id");

  const supabase = createAdminClient();

  const betDate = formData.get("bet_date");
  const stake = formData.get("stake");
  const slipReturnAmount = formData.get("slip_return_amount");

  await supabase
    .from("bets")
    .update({
      bet_date: typeof betDate === "string" && betDate ? betDate : undefined,
      stake: typeof stake === "string" && stake ? Number(stake) : undefined,
      slip_return_amount:
        typeof slipReturnAmount === "string" && slipReturnAmount ? Number(slipReturnAmount) : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", betId);

  for (let legNumber = 1; legNumber <= 3; legNumber++) {
    const league = formData.get(`leg_${legNumber}_league`);
    const homeTeam = formData.get(`leg_${legNumber}_home_team`);
    const awayTeam = formData.get(`leg_${legNumber}_away_team`);
    const matchDatetime = formData.get(`leg_${legNumber}_match_datetime`);
    const predictedOutcome = formData.get(`leg_${legNumber}_predicted_outcome`);
    const odds = formData.get(`leg_${legNumber}_odds`);

    const hasAnyValue = [league, homeTeam, awayTeam, matchDatetime, predictedOutcome, odds].some(
      (v) => typeof v === "string" && v.trim() !== ""
    );
    if (!hasAnyValue) continue;

    const leagueValid =
      typeof league === "string" && (LEAGUE_CODES as readonly string[]).includes(league);
    const outcomeValid =
      typeof predictedOutcome === "string" && (PREDICTED_OUTCOMES as readonly string[]).includes(predictedOutcome);
    const oddsNum = typeof odds === "string" ? Number(odds) : NaN;

    if (
      !leagueValid ||
      typeof homeTeam !== "string" ||
      !homeTeam.trim() ||
      typeof awayTeam !== "string" ||
      !awayTeam.trim() ||
      typeof matchDatetime !== "string" ||
      !matchDatetime ||
      !outcomeValid ||
      !Number.isFinite(oddsNum) ||
      oddsNum <= 0
    ) {
      // Leave genuinely incomplete/invalid legs out rather than violating
      // the DB's NOT NULL constraints (SPEC.md §5) — admin can finish these
      // from the Admin page (Phase 6). Odds below the 2.0 evens minimum are
      // NOT rejected here — SPEC.md §3.10 requires recording the real price
      // and red-flagging it (bet_legs.below_minimum_odds), never dropping it.
      continue;
    }

    await supabase.from("bet_legs").upsert(
      {
        bet_id: betId,
        leg_number: legNumber,
        league,
        home_team: homeTeam.trim(),
        away_team: awayTeam.trim(),
        match_datetime: new Date(matchDatetime).toISOString(),
        predicted_outcome: predictedOutcome,
        odds: oddsNum,
      },
      { onConflict: "bet_id,leg_number" }
    );
  }

  redirect("/upload/confirm/" + betId + "?saved=1");
}
