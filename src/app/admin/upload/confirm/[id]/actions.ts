"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";
import { LEAGUE_CODES, PREDICTED_OUTCOMES } from "@/lib/bet-schema";
import { nearestSaturdayAt3pm } from "@/lib/nearest-saturday";
import { deriveBetRollup, deriveWinStar, hasVoidLeg, type LegStatus } from "@/lib/settlement";

async function logAudit(
  supabase: ReturnType<typeof createAdminClient>,
  entry: {
    entity_type: "bet" | "bet_leg";
    entity_id: string;
    field_changed: string;
    old_value: string | null;
    new_value: string | null;
  }
) {
  const { error } = await supabase.from("admin_audit_log").insert({ ...entry, changed_by: "admin" });
  if (error) {
    // Auditability is required (SPEC.md §6.2), but a failure to log
    // shouldn't block the amend itself from having happened — surface it in
    // the server logs rather than losing the admin's correction.
    console.error(`Failed to write admin_audit_log entry (${entry.field_changed}):`, error.message);
  }
}

// Saves the admin's corrections from the confirm/amend screen (SPEC.md §6.1
// #2, §6.3). Uses the admin client because writes to bets/bet_legs are
// service-role-only per RLS (SPEC.md §6.2) — this server action is the one
// sanctioned path in from a public, unauthenticated page.
//
// Deliberately works the same whether the bet is still pending_review or
// already fully settled (Won/Lost/Void) — SPEC.md §6.3's "amend any bet or
// leg field" is not limited to unsettled bets, since real-world errors (a
// mistyped stake, a misread team name, a slip that turns out to belong to a
// different player) can surface after settlement just as easily as before
// it. Two things follow from allowing that:
//   1. Every changed field is written to admin_audit_log (previously this
//      action logged nothing at all — a gap for a settlement-affecting
//      correction, where knowing what changed and when matters most).
//   2. If the bet's leg statuses already fully determine an outcome (all
//      three Won/Lost, or a Void present), amending stake/slip_return_amount
//      re-derives status/winnings/win_star from the corrected figures rather
//      than leaving stale settlement numbers sitting on the bet — the same
//      derivation the settlement page itself uses (src/lib/settlement.ts),
//      so the Ranking table picks up the correction automatically. A Void
//      leg is left alone here regardless — that stays the dedicated
//      reconciliation control's job (§3.7a), not this form's.
export async function updateBetAction(formData: FormData) {
  const betId = formData.get("bet_id");
  if (typeof betId !== "string" || !betId) throw new Error("Missing bet id");

  const supabase = createAdminClient();

  const { data: betBefore } = await supabase.from("bets").select("*").eq("id", betId).single();
  if (!betBefore) throw new Error("Bet not found");

  const playerId = formData.get("player_id");
  const bookmakerId = formData.get("bookmaker_id");
  const betDate = formData.get("bet_date");
  const stake = formData.get("stake");
  const slipReturnAmount = formData.get("slip_return_amount");
  const adminNotes = formData.get("admin_notes");

  const betUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof playerId === "string" && playerId) betUpdate.player_id = playerId;
  if (typeof bookmakerId === "string" && bookmakerId) betUpdate.bookmaker_id = bookmakerId;
  if (typeof betDate === "string" && betDate) betUpdate.bet_date = betDate;
  if (typeof stake === "string" && stake) betUpdate.stake = Number(stake);
  if (typeof slipReturnAmount === "string" && slipReturnAmount) {
    betUpdate.slip_return_amount = Number(slipReturnAmount);
  }
  // admin_notes can legitimately be cleared to empty — unlike the other
  // fields above (where an empty field means "leave as-is", since a native
  // <select>/<input> should always carry a value once the page has loaded
  // once), so this one always writes, empty string or not.
  betUpdate.admin_notes = typeof adminNotes === "string" ? adminNotes : null;

  await supabase.from("bets").update(betUpdate).eq("id", betId);

  const betLevelChanges: Record<string, { old: unknown; new: unknown }> = {};
  const compareFields: Array<[string, keyof typeof betBefore]> = [
    ["player_id", "player_id"],
    ["bookmaker_id", "bookmaker_id"],
    ["bet_date", "bet_date"],
    ["stake", "stake"],
    ["slip_return_amount", "slip_return_amount"],
    ["admin_notes", "admin_notes"],
  ];
  for (const [key, betKey] of compareFields) {
    if (key in betUpdate) {
      const oldVal = betBefore[betKey];
      const newVal = betUpdate[key];
      // Loose comparison via String() — numeric/text form fields round-trip
      // through strings, so "10" vs 10 shouldn't count as a change.
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        betLevelChanges[key] = { old: oldVal, new: newVal };
      }
    }
  }
  if (Object.keys(betLevelChanges).length > 0) {
    await logAudit(supabase, {
      entity_type: "bet",
      entity_id: betId,
      field_changed: "amend",
      old_value: JSON.stringify(
        Object.fromEntries(Object.entries(betLevelChanges).map(([k, v]) => [k, v.old]))
      ),
      new_value: JSON.stringify(
        Object.fromEntries(Object.entries(betLevelChanges).map(([k, v]) => [k, v.new]))
      ),
    });
  }

  const { data: legsBefore } = await supabase
    .from("bet_legs")
    .select("*")
    .eq("bet_id", betId)
    .order("leg_number");
  const legBeforeByNumber = new Map((legsBefore ?? []).map((l) => [l.leg_number, l]));

  let savedLegCount = 0;
  const legIssues: string[] = [];

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
    // savedLegCount still got incremented and the confirm screen reported
    // success (or no warning at all) while bet_legs silently ended up with
    // zero rows. Now a DB-level failure is reported through legIssues
    // exactly like a validation failure.
    //
    // Only the fields this form edits are in the payload — Supabase's
    // upsert only sets the columns given here, so settlement-owned columns
    // (status, settled_via_90min_rule, settlement_notes, score_home_ft/
    // score_away_ft, settled_at) are left untouched on a conflict update.
    // That's what makes amending a settled bet's league/teams/kick-off/
    // odds safe: the leg's already-registered Won/Lost/Void status survives
    // the upsert unchanged.
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
      },
      { onConflict: "bet_id,leg_number" }
    );

    if (legWriteError) {
      legIssues.push(`Leg ${legNumber}: failed to save (${legWriteError.message})`);
      continue;
    }

    savedLegCount++;

    const before = legBeforeByNumber.get(legNumber);
    const legChanges: Record<string, { old: unknown; new: unknown }> = {};
    const newValues: Record<string, unknown> = {
      league,
      home_team: homeTeam.trim(),
      away_team: awayTeam.trim(),
      match_datetime: new Date(matchDatetime).toISOString(),
      predicted_outcome: predictedOutcome,
      odds: oddsNum,
    };
    for (const [key, newVal] of Object.entries(newValues)) {
      const oldVal = before ? (before as Record<string, unknown>)[key] : null;
      if (String(oldVal ?? "") !== String(newVal ?? "")) {
        legChanges[key] = { old: oldVal, new: newVal };
      }
    }
    if (Object.keys(legChanges).length > 0) {
      await logAudit(supabase, {
        entity_type: "bet_leg",
        entity_id: before?.id ?? `${betId}:${legNumber}`,
        field_changed: "amend",
        old_value: JSON.stringify(
          Object.fromEntries(Object.entries(legChanges).map(([k, v]) => [k, v.old]))
        ),
        new_value: JSON.stringify(
          Object.fromEntries(Object.entries(legChanges).map(([k, v]) => [k, v.new]))
        ),
      });
    }
  }

  // Re-derive the bet's settled status/winnings/win* if the correction
  // touched figures a live settlement depends on (stake doesn't feed the
  // roll-up, but slip_return_amount does — SPEC.md §3.7). Only when all
  // three legs exist and none is Void: a Void leg's outcome stays the
  // §3.7a reconciliation control's job, never this form's, and a bet with
  // fewer than 3 saved legs isn't in a determinable state yet.
  const { data: legsAfter } = await supabase
    .from("bet_legs")
    .select("status, settled_via_90min_rule")
    .eq("bet_id", betId)
    .order("leg_number");

  if ((legsAfter ?? []).length === 3) {
    const legStatuses = (legsAfter ?? []).map((l) => l.status as LegStatus);
    if (!hasVoidLeg(legStatuses)) {
      const finalSlipReturnAmount =
        typeof betUpdate.slip_return_amount === "number"
          ? betUpdate.slip_return_amount
          : Number(betBefore.slip_return_amount);
      const rollup = deriveBetRollup(legStatuses, finalSlipReturnAmount);
      const winStar = deriveWinStar(
        rollup.status,
        (legsAfter ?? []).map((l) => ({
          status: l.status as LegStatus,
          settledVia90MinRule: Boolean(l.settled_via_90min_rule),
        }))
      );

      const { error: betUpdateError } = await supabase
        .from("bets")
        .update({
          status: rollup.status,
          winnings: rollup.winnings,
          reconciliation: "standard",
          win_star: winStar,
          updated_at: new Date().toISOString(),
        })
        .eq("id", betId);

      if (betUpdateError) {
        throw new Error(`Failed to re-derive bet status after amend: ${betUpdateError.message}`);
      }

      if (
        rollup.status !== betBefore.status ||
        Number(rollup.winnings) !== Number(betBefore.winnings) ||
        winStar !== betBefore.win_star
      ) {
        await logAudit(supabase, {
          entity_type: "bet",
          entity_id: betId,
          field_changed: "status",
          old_value: JSON.stringify({
            status: betBefore.status,
            winnings: betBefore.winnings,
            win_star: betBefore.win_star,
          }),
          new_value: JSON.stringify({ status: rollup.status, winnings: rollup.winnings, win_star: winStar }),
        });
      }
    }
  }

  revalidatePath(`/admin/upload/confirm/${betId}`);
  revalidatePath(`/admin/bets/${betId}`);
  revalidatePath("/admin/bets");
  revalidatePath(`/bets/${betId}`);
  revalidatePath("/");

  // SPEC.md: after a successful upload+confirm, take the uploader to the
  // read-only view of what they just saved, with an "Upload a Bet Slip"
  // button — not back to the edit form. Only do this once all 3 legs are
  // actually saved; a partial save (some legs still missing a field) stays
  // on the confirm screen with legIssues explaining exactly what's left,
  // rather than sending the uploader to a view that looks "done" while legs
  // are silently missing. Amending an already-settled bet lands the same
  // place — the Admin settlement page (§6.1 #5) — since that's where the
  // just-corrected figures are visible alongside the leg statuses.
  if (savedLegCount === 3) {
    redirect(`/admin/bets/${betId}`);
  }
  const issuesParam = legIssues.length ? `&legIssues=${encodeURIComponent(JSON.stringify(legIssues))}` : "";
  redirect(`/admin/upload/confirm/${betId}?saved=1${issuesParam}`);
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
    `/admin/upload/confirm/${betId}?suggestLeg=${legNumber}&formState=${encodeURIComponent(JSON.stringify(formState))}`
  );
}
