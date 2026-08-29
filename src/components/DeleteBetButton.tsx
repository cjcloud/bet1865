"use client";

import { useTransition } from "react";
import { deleteBetAction } from "@/app/admin/bets/actions";

// Plain confirm() before submitting the delete - decided sufficient
// friction for v1 (SPEC.md §6.3, no type-to-confirm needed). Deletion is
// permanent (no soft-delete), so this is the only guard against a
// mis-click.
export default function DeleteBetButton({
  betId,
  label,
}: {
  betId: string;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm(`Delete this bet slip (${label})? This can't be undone from the app.`)) {
          return;
        }
        const formData = new FormData();
        formData.set("bet_id", betId);
        startTransition(() => {
          deleteBetAction(formData);
        });
      }}
      className="min-h-[36px] shrink-0 rounded border border-red-500/40 px-3 text-sm font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
