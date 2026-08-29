// Pure date-only arithmetic (no timezone conversion — betDateIso is a plain
// "YYYY-MM-DD" string and we only care which day of the week it falls on).
// Split out of actions.ts because a "use server" file requires every export
// to be an async server action.
export function nearestSaturdayAt3pm(betDateIso: string): string {
  const [y, m, d] = betDateIso.split("-").map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1);
  const dayOfWeek = base.getDay(); // 0 = Sunday .. 6 = Saturday

  let offsetDays = 0;
  if (dayOfWeek !== 6) {
    const daysForward = 6 - dayOfWeek; // 1..6
    const daysBack = dayOfWeek + 1; // 1..6
    offsetDays = daysForward <= daysBack ? daysForward : -daysBack;
  }

  const target = new Date(base);
  target.setDate(target.getDate() + offsetDays);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T15:00`;
}
