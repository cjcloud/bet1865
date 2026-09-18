// Fractional-odds display formatting.
//
// The app's underlying logic always stores/works with odds in DECIMAL form
// (e.g. Evens = 2.00, 6/1 = 7.00) - see extract-bet.ts / SPEC.md §3.11.
// Bet slips and bettors think in FRACTIONAL odds though, so the UI displays
// the fractional form. Decimal odds are always stored to 2 decimal places,
// so a decimal value can be treated as an exact integer number of pence
// (decimal * 100) with no floating-point ambiguity.
//
// A "nice" fraction is one with a denominator no larger than NICE_LIMIT -
// this covers essentially every fraction a UK bookmaker actually prices
// (1/2, 6/4, 11/10, 5/2, 6/1, 20/1, ...). If the exact reduction of the
// stored decimal is already nice, it's used as-is. Otherwise (e.g. a
// decimal like 6.99 that's 1p short of an exact 7.00 = 6/1, reducing
// literally to an unwieldy 599/100) the closest nice fraction within
// TOLERANCE_CENTS is used instead, so the display never shows something
// like "599/100" for what is really just "6/1".
const NICE_LIMIT = 20;
const TOLERANCE_CENTS = 1;

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

export interface OddsFraction {
  numerator: number;
  denominator: number;
}

/**
 * Converts decimal odds (e.g. 7.00, 2.10, 1.87) into fractional odds
 * (e.g. 6/1, 11/10) for display.
 *
 * Decimal odds of 1.00 or below have no meaningful fractional price (no
 * profit above stake) and return { numerator: 0, denominator: 1 }.
 */
export function decimalToFraction(decimal: number): OddsFraction {
  const cents = Math.round(decimal * 100);
  const p0 = cents - 100; // profit part, in pence, over an implicit /100

  if (p0 <= 0) {
    return { numerator: 0, denominator: 1 };
  }

  const exactGcd = gcd(p0, 100);
  const exact: OddsFraction = { numerator: p0 / exactGcd, denominator: 100 / exactGcd };

  if (exact.denominator <= NICE_LIMIT) {
    return exact;
  }

  // Exact reduction isn't nice (large, coprime-ish denominator) - look for
  // the closest nice fraction (denominator <= NICE_LIMIT). Prefer the
  // smallest error, breaking ties by the smallest denominator.
  let best: { numerator: number; denominator: number; errorCents: number } | null = null;
  for (let den = 1; den <= NICE_LIMIT; den++) {
    const num = Math.round((p0 * den) / 100);
    if (num <= 0) continue;
    const reconCents = (num * 100) / den;
    const errorCents = Math.abs(reconCents - p0);
    if (!best || errorCents < best.errorCents || (errorCents === best.errorCents && den < best.denominator)) {
      best = { numerator: num, denominator: den, errorCents };
    }
  }

  if (best && best.errorCents <= TOLERANCE_CENTS) {
    const g = gcd(best.numerator, best.denominator);
    return { numerator: best.numerator / g, denominator: best.denominator / g };
  }

  return exact;
}

/**
 * Formats decimal odds as a fractional-odds string for display, e.g.
 * "6/1", "11/10" - or "Evens" for 2.00 (1/1).
 */
export function formatFractionalOdds(decimal: number): string {
  const { numerator, denominator } = decimalToFraction(decimal);
  if (numerator === 0) return "0/1";
  if (numerator === denominator) return "Evens";
  return `${numerator}/${denominator}`;
}

/**
 * Parses a fractional-odds string exactly as printed on a bet slip (e.g.
 * "11/10", "6/5", "20/23") into DECIMAL odds: decimal = 1 + (numerator ÷
 * denominator), rounded to 2 decimal places - see SPEC.md §3.11.
 *
 * Returns null if the string isn't a valid "num/den" fraction. This is the
 * single source of truth for fraction->decimal conversion - callers should
 * use this instead of re-deriving it (see extract-bet.ts, which asks Claude's
 * vision model to do this arithmetic itself as a best-effort first pass, but
 * a model occasionally just copies the fraction's digits as if they were
 * already a decimal, e.g. reading "6/5" as 1.20 instead of 2.20 - wherever an
 * odds_fraction is available, it should be treated as ground truth and run
 * through this function rather than trusting that freehand value).
 */
export function fractionToDecimal(fraction: string): number | null {
  const parts = fraction.trim().split("/");
  if (parts.length !== 2) return null;
  const numerator = Number(parts[0]);
  const denominator = Number(parts[1]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }
  return Math.round((1 + numerator / denominator) * 100) / 100;
}
