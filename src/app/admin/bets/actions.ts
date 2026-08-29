"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";

// Deletes a bet slip entirely - the bet row and its legs - for cases like a
// duplicate upload or a slip recorded against the wrong player (SPEC.md
// §6.3). Admin-only (this route sits under /admin, gated by middleware.ts).
// Gated client-side by a plain confirm dialog (DeleteBetButton.tsx) - no
// further friction needed per the 29 Aug 2026 decision.
//
// Before the row is removed, the full bet + its legs are snapshotted as JSON
// into admin_audit_log, so there's a permanent record of exactly what
// existed even though the live row is gone - the only recovery path in v1,
// since there is no soft-delete/recycle-bin (SPEC.md §8).
export async function deleteBetAction(formData: FormData) {
  const betId = formData.get("bet_id");
  if (typeof betId !== "string" || !betId) {
    throw new Error("Missing bet id");
  }

  const supabase = createAdminClient();

  const { data: bet } = await supabase.from("bets").select("*").eq("id", betId).single();
  if (!bet) {
    // Already gone (e.g. double-submit) - nothing to do.
    redirect("/admin/bets?deleted=1");
  }

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
    throw new Error(`Failed to log delete audit entry: ${auditError.message}`);
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
    throw new Error(`Failed to delete bet: ${deleteError.message}`);
  }

  revalidatePath("/admin/bets");
  revalidatePath("/bets");
  revalidatePath("/");
  redirect("/admin/bets?deleted=1");
}
