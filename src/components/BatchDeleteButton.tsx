"use client";

// Submits the enclosing batch-delete form (action={batchDeleteBetsAction}).
// Reads how many `bet_ids` checkboxes are currently checked at click time -
// no local selection state needed, same reasoning as SelectAllCheckbox -
// purely to build a specific confirm() message ("Delete 3 bet slips?"
// rather than a generic one) and to block the submit entirely when nothing
// is selected. Deletion is permanent (no soft-delete, SPEC.md §8), so this
// plain confirm() is the only guard against a mis-click, same friction
// level as the existing single-slip DeleteBetButton (decided sufficient for
// v1 on 29 Aug 2026).
export default function BatchDeleteButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        const form = e.currentTarget.closest("form");
        const checked = form?.querySelectorAll<HTMLInputElement>('input[name="bet_ids"]:checked').length ?? 0;
        if (checked === 0) {
          e.preventDefault();
          alert("Select at least one bet slip to delete.");
          return;
        }
        if (
          !confirm(
            `Delete ${checked} bet slip${checked === 1 ? "" : "s"}? This can't be undone from the app.`
          )
        ) {
          e.preventDefault();
        }
      }}
      className="min-h-[36px] shrink-0 rounded border border-red-500/40 px-3 text-sm font-medium text-red-300 hover:bg-red-500/10"
    >
      Delete selected
    </button>
  );
}
