"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { LEAGUE_CODES, PREDICTED_OUTCOMES } from "@/lib/bet-schema";
import { nearestSaturdayAt3pm } from "@/lib/nearest-saturday";

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

  let anyLegSaved = false;
  let savedLegCount = 0;
  const legIssues: string[] = [];

  for (let legNumber = 1; legNumber <= 3; legNumber++) {
    const league = formData.get(`leg_${legNumber}_league`);
    const homeTeam = formData.get(`leg_${legNumber}_home_team`);
    const awayTeam = formData.get(`leg_${legNumber}_away_team`);
    const matchDatetime = formData.get(`leg_${legNumber}_match_datetime`);
    const predictedOutcome = formData.get(`leg_${legNumber}_predicted_outcome`);
    const odds = formData.get(`leg_${legNumber}_odds`);
    const externalFixtureId = formData.get(`leg_${legNumber}_external_fixture_id`);

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
      //
      // Report exactly which field(s) are missing/invalid so the confirm
      // screen can tell the uploader why nothing was saved instead of
      // silently dropping the leg — a native <input type="datetime-local">
      // resets to an empty value if any of its date/time segments is left
      // incomplete, which was previously indistinguishable from "never
      // touched this leg" and produced a misleading "Saved" banner.
      const missing: string[] = [];
      if (!leagueValid) missing.push("league");
      if (typeof homeTeam !== "string" || !homeTeam.trim()) missing.push("home team");
      if (typeof awayTeam !== "string" || !awayTeam.trim()) missing.push("away team");
      if (typeof matchDatetime !== "string" || !matchDatetime) missing.push("kick-off date/time");
      if (!outcomeValid) missing.push("predicted outcome");
      if (!Number.isFinite(oddsNum) || oddsNum <= 0) missing.push("odds");
      legIssues.push(`Leg ${legNumber}: ${missing.join(", ")} missing or invalid`);
      continue;
    }

    // IMPORTANT: check the write result. This previously assumed the
    // upsert succeeded just because the leg passed field validation above
    // - if Supabase rejected the row (schema mismatch, constraint, RLS),
    // savedLegCount/anyLegSaved still got incremented and the confirm
    // screen reported success (or no warning at all) while bet_legs
    // silently ended up with zero rows. Now a DB-level failure is reported
    // through legIssues exactly like a validation failure.
    const { error: legWriteError } = await supabase.from("bet_legs").upsert(
      {
        bet_id: betId,
        leg_number: legNumber,
        league,
        home_team: homeTeam.trim(),
        away_team: awayTeam.trim(),
        match_datetime: new Date(matchDatetime).toISOString(),
        predicted_outcome: predictedOutcome,
        odds: oddsNum,
        external_fixture_id:
          typeof externalFixtureId === "string" && externalFixtureId ? externalFixtureId : null,
      },
      { onConflict: "bet_id,leg_number" }
    );

    if (legWriteError) {
      legIssues.push(`Leg ${legNumber}: failed to save (${legWriteError.message})`);
      continue;
    }

    anyLegSaved = true;
    savedLegCount++;
  }

  // SPEC.md: after a successful upload+confirm, take the uploader to the
  // read-only view of what they just saved, with an "Upload a Bet Slip"
  // button — not back to the edit form. Only do this once all 3 legs are
  // actually saved; a partial save (some legs still missing a field) stays
  // on the confirm screen with legIssues explaining exactly what's left,
  // rather than sending the uploader to a view that looks "done" while legs
  // are silently missing.
  if (savedLegCount === 3) {
    redirect(`/bets/${betId}`);
  }
  const issuesParam = legIssues.length ? `&legIssues=${encodeURIComponent(JSON.stringify(legIssues))}` : "";
  redirect(`/upload/confirm/${betId}?saved=1${issuesParam}`);
}

// SPEC.md §3.12a: automated fixture lookup (API-Football) is parked — the
// group's matches are overwhelmingly played at the traditional Saturday
// 3pm slot, so this gives the uploader/admin a one-click starting guess
// instead of typing a date by hand, while staying purely a suggestion: it
// never writes to bet_legs, only pre-fills the kick-off input via a
// redirect param, and the admin can freely retype it before hitting Save
// if the actual fixture was an evening kick-off, a Sunday, moved for TV,
// etc.
//
// IMPORTANT: this button's click is a full form submit -> full page
// redirect -> fresh server render, same as every other formAction on this
// page. Next.js does not preserve unsaved input values across that
// round-trip on its own - only what the redirect URL and the DB/AI data
// carry back get shown. Clicking leg 2's button after already clicking
// leg 1's therefore used to blow away leg 1's freshly-set value (and any
// other unsaved edit on the page), because only the just-clicked leg's new
// value ever made it into the redirect. To fix that, this reads EVERY
// field currently in the form - not just the leg being changed - and
// carries the whole lot forward as one `formState` param, so page.tsx can
// re-render every field exactly as the browser last had it, with only the
// clicked leg's kick-off actually changed.
export async function setNearestSaturdayAction(legNumber: number, formData: FormData) {
  // legNumber arrives via .bind(null, legNumber) on the button's formAction
  // in page.tsx, not as a form field — see the long-standing comment
  // history on this file for why (a submit button's own name/value pair
  // isn't reliably present in the FormData a server action receives).
  const betId = formData.get("bet_id");
  if (typeof betId !== "string" || !betId) throw new Error("Missing bet id");
  if (!Number.isFinite(legNumber)) throw new Error("Missing leg number");

  const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

  const betDate = str(formData.get("bet_date")) || new Date().toISOString().slice(0, 10);

  const legs: Record<number, Record<string, string>> = {};
  for (let n = 1; n <= 3; n++) {
    legs[n] = {
      league: str(formData.get(`leg_${n}_league`)),
      home_team: str(formData.get(`leg_${n}_home_team`)),
      away_team: str(formData.get(`leg_${n}_away_team`)),
      match_datetime: str(formData.get(`leg_${n}_match_datetime`)),
      predicted_outcome: str(formData.get(`leg_${n}_predicted_outcome`)),
      odds: str(formData.get(`leg_${n}_odds`)),
    };
  }
  // Only this one leg's kick-off actually changes - everything else in
  // `legs` is exactly what was already sitting in the form.
  legs[legNumber].match_datetime = nearestSaturdayAt3pm(betDate);

  const formState = {
    bet_date: betDate,
    stake: str(formData.get("stake")),
    slip_return_amount: str(formData.get("slip_return_amount")),
    legs,
  };

  redirect(
    `/upload/confirm/${betId}?suggestLeg=${legNumber}&formState=${encodeURIComponent(JSON.stringify(formState))}`
  );
}
