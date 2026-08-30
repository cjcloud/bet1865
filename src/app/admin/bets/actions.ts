"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";

// Shared by both the single-slip delete button and the batch delete form
// below — snapshots the bet + its legs into admin_audit_log, best-effort
// removes the slip image, then deletes the row (bet_legs cascade per SPEC.md
// §5's schema). Throws on a failure that should stop the batch (missing
// audit log write, or the row delete itself); a missing bet (already
// deleted, e.g. a double-submit) is treated as a no-op, not an error.
async function deleteOneBet(supabase: ReturnType<typeof createAdminClient>, betId: string) {
  const { data: bet } = await supabase.from("bets").select("*").eq("id", betId).single();
  if (!bet) return;

  const { data: legs } = await supabase
    .from("bet_legs")
    .select("*")
    .eq("bet_id", betId)
    .order("leg_number");

  const { error: auditError } = await supabase.from("admin_audit_log").insert({
    entity_type: "bet",
    entity_id: betId,
    field_changed: "deleted",
    old_value: JSON.stringify({ bet, legs: legs ?? [] }),
    new_value: null,
    changed_by: "admin",
  });
  if (auditError) {
    // Don't delete anything if we couldn't record the snapshot first - the
    // audit trail is the only way to recover from a mistaken delete.
    throw new Error(`Failed to log delete audit entry for ${betId}: ${auditError.message}`);
  }

  if (bet.slip_image_path) {
    const { error: storageError } = await supabase.storage
      .from("betslips")
      .remove([bet.slip_image_path]);
    if (storageError) {
      // Best-effort per SPEC.md §6.3 - a leftover image file is a tidiness
      // issue, not a reason to block the row deletion.
      console.error(`Failed to delete slip image ${bet.slip_image_path}:`, storageError.message);
    }
  }

  const { error: deleteError } = await supabase.from("bets").delete().eq("id", betId);
  if (deleteError) {
    throw new Error(`Failed to delete bet ${betId}: ${deleteError.message}`);
  }
}

// Deletes a bet slip entirely - the bet row and its legs - for cases like a
// duplicate upload or a slip recorded against the wrong player (SPEC.md
// §6.3). Admin-only (this route sits under /admin, gated by middleware.ts).
// Gated client-side by a plain confirm dialog (DeleteBetButton.tsx) - no
// further friction needed per the 29 Aug 2026 decision.
export async function deleteBetAction(formData: FormData) {
  const betId = formData.get("bet_id");
  if (typeof betId !== "string" || !betId) {
    throw new Error("Missing bet id");
  }

  const supabase = createAdminClient();
  await deleteOneBet(supabase, betId);

  revalidatePath("/admin/bets");
  revalidatePath("/bets");
  revalidatePath("/");
  redirect("/admin/bets?deleted=1");
}

// Batch delete (30 Aug 2026, Phase 6) - lets the admin clear out several
// mistaken/duplicate slips in one go from the All Bets list's checkboxes,
// rather than one confirm-and-delete round trip per slip. Same guarantees
// as a single delete, just looped: every bet gets its own audit-log
// snapshot before removal, and a failure on one bet doesn't abandon the
// rest of the batch (its id is just reported back as not deleted) - a
// half-finished batch delete should never leave the admin unsure which
// slips actually went and which didn't.
export async function batchDeleteBetsAction(formData: FormData) {
  const betIds = formData
    .getAll("bet_ids")
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (betIds.length === 0) {
    redirect("/admin/bets");
  }

  const supabase = createAdminClient();
  let deletedCount = 0;
  let failedCount = 0;

  for (const betId of betIds) {
    try {
      await deleteOneBet(supabase, betId);
      deletedCount++;
    } catch (err) {
      failedCount++;
      console.error(`Batch delete: failed to delete bet ${betId}:`, err);
    }
  }

  revalidatePath("/admin/bets");
  revalidatePath("/bets");
  revalidatePath("/");

  const failedParam = failedCount > 0 ? `&failed=${failedCount}` : "";
  redirect(`/admin/bets?deleted=${deletedCount}${failedParam}`);
}
