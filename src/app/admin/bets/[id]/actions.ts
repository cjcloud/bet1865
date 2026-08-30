"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  applyVoidReconciliation,
  clearReconciliation,
  deriveBetRollup,
  deriveWinStar,
  hasVoidLeg,
  type LegStatus,
} from "@/lib/settlement";

const LEG_STATUSES: readonly LegStatus[] = ["pending", "won", "lost", "void"];

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v : "";
}

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
    // Audit logging is required (SPEC.md §6.2 auditability), but a failure
    // here shouldn't block the settlement update itself from having
    // happened — surface it in the server logs for the admin to notice.
    console.error(`Failed to write admin_audit_log entry (${entry.field_changed}):`, error.message);
  }
}

// Registers one leg's Won/Lost/Void status (SPEC.md §3.9a) — a plain
// three-way status picker regardless of bookmaker; for a Betfair-sourced
// leg the admin has already read the settled status straight off Betfair
// (§3.8) before picking here, no judgement call happens in this app.
//
// After saving the leg, re-derives the bet's overall status/winnings:
//  - if no leg is void, run the plain §3.7 roll-up (deriveBetRollup)
//  - if any leg is void, the roll-up does NOT fire — the bet stays
//    pending_settlement until the admin completes the §3.7a reconciliation
//    control, UNLESS this very edit just removed the last void leg, in
//    which case reconciliation resets to 'standard' and the roll-up
//    resumes automatically (§3.7a's last paragraph).
export async function updateLegStatusAction(legNumber: number, status: LegStatus, formData: FormData) {
  const betId = str(formData.get("bet_id"));
  if (!betId) throw new Error("Missing bet id");
  if (!Number.isFinite(legNumber) || legNumber < 1 || legNumber > 3) {
    throw new Error("Missing/invalid leg number");
  }
  if (!LEG_STATUSES.includes(status)) throw new Error("Invalid leg status");

  const supabase = createAdminClient();

  const { data: bet } = await supabase.from("bets").select("*").eq("id", betId).single();
  if (!bet) throw new Error("Bet not found");

  const { data: legsBefore } = await supabase
    .from("bet_legs")
    .select("*")
    .eq("bet_id", betId)
    .order("leg_number");

  const currentLeg = (legsBefore ?? []).find((l) => l.leg_number === legNumber);
  const wasVoidBefore = hasVoidLeg((legsBefore ?? []).map((l) => l.status as LegStatus));

  const settlementNotes = formData.get(`leg_${legNumber}_settlement_notes`);
  const scoreHomeFt = formData.get(`leg_${legNumber}_score_home_ft`);
  const scoreAwayFt = formData.get(`leg_${legNumber}_score_away_ft`);
  // Only meaningful (and only ever shown to the admin) on a Won leg — force
  // it false otherwise so a stale checked box from before a Lost/Void
  // re-pick can't linger (SPEC.md §3.8/§4).
  const settledVia90MinRule = status === "won" && formData.get(`leg_${legNumber}_settled_via_90min_rule`) === "on";

  const { error: legUpdateError } = await supabase
    .from("bet_legs")
    .update({
      status,
      settlement_notes: typeof settlementNotes === "string" && settlementNotes ? settlementNotes : null,
      score_home_ft:
        typeof scoreHomeFt === "string" && scoreHomeFt !== "" ? Number(scoreHomeFt) : null,
      score_away_ft:
        typeof scoreAwayFt === "string" && scoreAwayFt !== "" ? Number(scoreAwayFt) : null,
      settled_at: status === "won" || status === "lost" ? new Date().toISOString() : null,
      settled_via_90min_rule: settledVia90MinRule,
    })
    .eq("bet_id", betId)
    .eq("leg_number", legNumber);

  if (legUpdateError) {
    throw new Error(`Failed to save leg ${legNumber}: ${legUpdateError.message}`);
  }

  await logAudit(supabase, {
    entity_type: "bet_leg",
    entity_id: currentLeg?.id ?? `${betId}:${legNumber}`,
    field_changed: "status",
    old_value: currentLeg?.status ?? null,
    new_value: status,
  });

  const { data: legsAfter } = await supabase
    .from("bet_legs")
    .select("status, settled_via_90min_rule")
    .eq("bet_id", betId)
    .order("leg_number");

  const legStatuses = (legsAfter ?? []).map((l) => l.status as LegStatus);
  const isVoidNow = hasVoidLeg(legStatuses);

  if (!isVoidNow) {
    // No void leg present (either never was, or this edit just cleared the
    // last one) — run/re-run the plain roll-up, resetting reconciliation to
    // 'standard' so a bet that was previously void-reconciled and has now
    // had its void leg corrected goes back to normal scoring (§3.7a).
    const rollup = wasVoidBefore
      ? clearReconciliation(legStatuses, Number(bet.slip_return_amount))
      : { ...deriveBetRollup(legStatuses, Number(bet.slip_return_amount)), reconciliation: "standard" as const };

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
        reconciliation: rollup.reconciliation,
        win_star: winStar,
        updated_at: new Date().toISOString(),
      })
      .eq("id", betId);

    if (betUpdateError) {
      throw new Error(`Failed to update bet status: ${betUpdateError.message}`);
    }

    if (
      rollup.status !== bet.status ||
      Number(rollup.winnings) !== Number(bet.winnings) ||
      winStar !== bet.win_star
    ) {
      await logAudit(supabase, {
        entity_type: "bet",
        entity_id: betId,
        field_changed: "status",
        old_value: JSON.stringify({ status: bet.status, winnings: bet.winnings, win_star: bet.win_star }),
        new_value: JSON.stringify({ status: rollup.status, winnings: rollup.winnings, win_star: winStar }),
      });
    }
  }
  // If a void leg IS present, deliberately leave bets.status/winnings alone
  // — the admin must use the reconciliation control (voidReconciliationAction)
  // to resolve it (§3.7a).

  revalidatePath(`/admin/bets/${betId}`);
  revalidatePath("/admin/bets");
  revalidatePath(`/bets/${betId}`);
  revalidatePath("/");
  revalidatePath("/ranking");
  redirect(`/admin/bets/${betId}`);
}

// §3.7a — resolves a bet with a Void leg: either voids the whole bet (full
// stake refund, excluded from scoring) or records the bookmaker's own
// recalculated return. Re-choosing overwrites the previous reconciliation.
export async function voidReconciliationAction(formData: FormData) {
  const betId = str(formData.get("bet_id"));
  if (!betId) throw new Error("Missing bet id");

  const actionType = str(formData.get("reconciliation_action"));
  if (actionType !== "void_whole_bet" && actionType !== "manual_bookmaker_return") {
    throw new Error("Invalid reconciliation action");
  }

  const supabase = createAdminClient();
  const { data: bet } = await supabase.from("bets").select("*").eq("id", betId).single();
  if (!bet) throw new Error("Bet not found");

  const { data: legs } = await supabase
    .from("bet_legs")
    .select("status, settled_via_90min_rule")
    .eq("bet_id", betId);
  const legStatuses = (legs ?? []).map((l) => l.status as LegStatus);

  if (!hasVoidLeg(legStatuses)) {
    throw new Error("No void leg on this bet — nothing to reconcile");
  }

  const result =
    actionType === "void_whole_bet"
      ? applyVoidReconciliation({ type: "void_whole_bet", stake: Number(bet.stake) })
      : applyVoidReconciliation({
          type: "manual_bookmaker_return",
          amount: Number(str(formData.get("bookmaker_return_amount")) || 0),
        });

  // manual_bookmaker_return can also settle a bet as "won" (§3.7a), so the
  // win* flag still needs deriving here — void_whole_bet always yields
  // status "void", for which deriveWinStar is false regardless.
  const winStar = deriveWinStar(
    result.status,
    (legs ?? []).map((l) => ({
      status: l.status as LegStatus,
      settledVia90MinRule: Boolean(l.settled_via_90min_rule),
    }))
  );

  const { error: updateError } = await supabase
    .from("bets")
    .update({
      status: result.status,
      winnings: result.winnings,
      reconciliation: result.reconciliation,
      win_star: winStar,
      updated_at: new Date().toISOString(),
    })
    .eq("id", betId);

  if (updateError) {
    throw new Error(`Failed to save void reconciliation: ${updateError.message}`);
  }

  await logAudit(supabase, {
    entity_type: "bet",
    entity_id: betId,
    field_changed: "reconciliation",
    old_value: JSON.stringify({
      status: bet.status,
      winnings: bet.winnings,
      reconciliation: bet.reconciliation,
    }),
    new_value: JSON.stringify(result),
  });

  revalidatePath(`/admin/bets/${betId}`);
  revalidatePath("/admin/bets");
  revalidatePath(`/bets/${betId}`);
  revalidatePath("/");
  revalidatePath("/ranking");
  redirect(`/admin/bets/${betId}`);
}
