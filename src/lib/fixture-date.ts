// Corrects the YEAR the AI vision extraction (src/lib/extract-bet.ts) puts on
// a leg's match_datetime. UK bet slips almost never print a year (just day +
// month, e.g. "Sat 19 Sep"), so the model has to infer it - and even with an
// explicit "today's date" anchor in the prompt, a vision model can still fall
// back to a plausible-looking year from its training data instead of
// reasoning it out (observed live: a slip uploaded 18 Sep 2026 came back with
// match_datetime "2024-09-19...", which IS a real Thursday - so day/month
// were read correctly, but the wrong year silently turned a Saturday fixture
// into a "Thursday" one wherever the date is displayed).
//
// Every bet slip is for a near-term fixture (SPEC.md's confirm-screen note:
// typically ~4 days out, max ~7), so the correct year is always whichever of
// last/this/next year puts that day+month closest to the reference date
// (the bet's own date, or today if unknown) - never the model's freehand
// guess. This is deterministic and doesn't depend on the model getting the
// year right at all, only the day and month (which are what's actually
// printed on the slip).
export function correctNearTermYear(isoDatetime: string, referenceDate: Date): string {
  const match = isoDatetime.match(/^\d{4}-(\d{2}-\d{2}T.*)$/);
  if (!match) return isoDatetime;
  const monthDayAndRest = match[1];
  const referenceYear = referenceDate.getUTCFullYear();

  let best: { year: number; diffMs: number } | null = null;
  for (const year of [referenceYear - 1, referenceYear, referenceYear + 1]) {
    const candidate = new Date(`${year}-${monthDayAndRest}`);
    if (Number.isNaN(candidate.getTime())) continue;
    const diffMs = Math.abs(candidate.getTime() - referenceDate.getTime());
    if (!best || diffMs < best.diffMs) best = { year, diffMs };
  }

  if (!best) return isoDatetime;
  return `${best.year}-${monthDayAndRest}`;
}
