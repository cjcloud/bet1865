"use client";

// Toggles every `bet_ids` checkbox in the enclosing batch-delete form.
// Reads/writes the DOM directly at click time rather than lifting selection
// into React state - the list of bets is server-rendered, and each checkbox
// is already a plain, independently-submittable form control, so there's no
// need for a shared state tree just to flip them all at once.
export default function SelectAllCheckbox() {
  return (
    <label className="flex min-h-[36px] items-center gap-2 text-sm text-white/70">
      <input
        type="checkbox"
        onChange={(e) => {
          const form = e.currentTarget.closest("form");
          form?.querySelectorAll<HTMLInputElement>('input[name="bet_ids"]').forEach((cb) => {
            cb.checked = e.currentTarget.checked;
          });
        }}
        className="h-4 w-4"
      />
      Select all
    </label>
  );
}
