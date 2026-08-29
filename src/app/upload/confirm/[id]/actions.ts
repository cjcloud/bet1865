"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { LEAGUE_CODES, PREDICTED_OUTCOMES } from "@/lib/bet-schema";
import { findFixtureCandidates } from "@/lib/api-football";

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
        external_fixture_id:
          typeof externalFixtureId === "string" && externalFixtureId ? externalFixtureId : null,
      },
      { onConflict: "bet_id,leg_number" }
    );
    anyLegSaved = true;

    // Leg is now fully saved to bet_legs — any pending fixture candidates
    // for it are no longer needed as a fallback source (page.tsx prefers
    // the saved row anyway, but clear them so stale options don't linger).
    await supabase
      .from("bet_leg_fixture_candidates")
      .delete()
      .eq("bet_id", betId)
      .eq("leg_number", legNumber);
  }

  // SPEC.md: after a successful upload+confirm, take the uploader to the
  // read-only view of what they just saved, with an "Upload a Bet Slip"
  // button — not back to the edit form.
  if (anyLegSaved) {
    redirect(`/bets/${betId}`);
  }
  redirect(`/upload/confirm/${betId}?saved=1`);
}

// SPEC.md §3.12: searches API-Football for fixtures between the two named
// teams within 7 days of the bet's date (across the 4 pyramid divisions +
// FA Cup + EFL Cup, so a same-week league/cup pairing can be told apart).
// Results are staged in bet_leg_fixture_candidates for the confirm page to
// render as a pick-list — never auto-applied, even when there's only one
// match, so the uploader/admin always confirms before it overwrites a
// manually-typed date.
export async function lookupFixtureAction(legNumber: number, formData: FormData) {
  // legNumber arrives via .bind(null, legNumber) on the button's formAction
  // in page.tsx, NOT as a form field. A submit button's own name/value pair
  // is not reliably included in the FormData a Next.js server action
  // receives (React intercepts the submit rather than doing a native
  // HTMLFormElement.requestSubmit(submitter)) — that was the original bug
  // here: leg_number came through as null, Number(null) is 0 (not NaN, so
  // the "missing" check didn't catch it), and everything cascaded from
  // there. .bind() is the documented, reliable way to pass a per-row id
  // into a server action.
  const betId = formData.get("bet_id");
  if (typeof betId !== "string" || !betId) throw new Error("Missing bet id");
  if (!Number.isFinite(legNumber)) throw new Error("Missing leg number");

  // This action is wired up as a second submit button (`formAction`) on the
  // SAME form as the main Save button, purely so it sees the live-typed
  // team names without any nested <form> or client JS — so the field names
  // here are the leg-specific ones from that shared form, not generic ones.
  const homeTeam = formData.get(`leg_${legNumber}_home_team`);
  const awayTeam = formData.get(`leg_${legNumber}_away_team`);
  const betDate = formData.get("bet_date");

  const supabase = createAdminClient();

  // Always clear first: a re-search should replace whatever was there,
  // including a previously-chosen candidate — the uploader is explicitly
  // asking to search again.
  await supabase
    .from("bet_leg_fixture_candidates")
    .delete()
    .eq("bet_id", betId)
    .eq("leg_number", legNumber);

  if (
    typeof homeTeam !== "string" ||
    !homeTeam.trim() ||
    typeof awayTeam !== "string" ||
    !awayTeam.trim() ||
    typeof betDate !== "string" ||
    !betDate
  ) {
    redirect(`/upload/confirm/${betId}?fixtureSearch=${legNumber}&fixtureError=missing-fields`);
  }

  // IMPORTANT: next/navigation's redirect() works by throwing, so it must
  // never be called from inside this try block — a catch(err) here would
  // otherwise swallow a successful redirect and misreport it as a fetch
  // error. Capture the outcome instead and redirect once, after the block.
  let errorMessage: string | null = null;
  try {
    const candidates = await findFixtureCandidates({
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
      fromDate: betDate,
    });

    if (candidates.length) {
      await supabase.from("bet_leg_fixture_candidates").insert(
        candidates.map((c) => ({
          bet_id: betId,
          leg_number: legNumber,
          external_fixture_id: c.externalFixtureId,
          competition_slug: c.competitionSlug,
          competition_label: c.competitionLabel,
          home_team: c.homeTeam,
          away_team: c.awayTeam,
          kickoff: c.kickoffIso,
          venue: c.venue,
        }))
      );
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  if (errorMessage) {
    redirect(`/upload/confirm/${betId}?fixtureSearch=${legNumber}&fixtureError=${encodeURIComponent(errorMessage)}`);
  }
  redirect(`/upload/confirm/${betId}?fixtureSearch=${legNumber}`);
}

// Marks one candidate as chosen (and drops its siblings) so the confirm
// page's pre-fill logic picks it up for that leg. Does NOT write to
// bet_legs directly — the uploader still hits the main Save button, which
// also carries predicted_outcome/odds that this narrower action doesn't
// have.
export async function chooseFixtureAction(
  legNumber: number,
  externalFixtureId: string,
  formData: FormData
) {
  // Both identifiers arrive via .bind(null, legNumber, externalFixtureId) —
  // see the comment in lookupFixtureAction for why, not as form fields.
  const betId = formData.get("bet_id");
  if (typeof betId !== "string" || !betId) throw new Error("Missing bet id");
  if (!Number.isFinite(legNumber) || !externalFixtureId) {
    throw new Error("Missing fixture choice");
  }

  const supabase = createAdminClient();

  await supabase
    .from("bet_leg_fixture_candidates")
    .delete()
    .eq("bet_id", betId)
    .eq("leg_number", legNumber)
    .neq("external_fixture_id", externalFixtureId);

  await supabase
    .from("bet_leg_fixture_candidates")
    .update({ chosen: true })
    .eq("bet_id", betId)
    .eq("leg_number", legNumber)
    .eq("external_fixture_id", externalFixtureId);

  redirect(`/upload/confirm/${betId}`);
}

