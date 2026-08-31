import { describe, expect, it } from "vitest";
import { decimalToFraction, formatFractionalOdds } from "./odds-format";

describe("formatFractionalOdds", () => {
  it("formats Evens as 'Evens', not 1/1", () => {
    expect(formatFractionalOdds(2.0)).toBe("Evens");
  });

  it("formats simple whole-number fractions", () => {
    expect(formatFractionalOdds(7.0)).toBe("6/1");
    expect(formatFractionalOdds(3.0)).toBe("2/1");
    expect(formatFractionalOdds(11.0)).toBe("10/1");
  });

  it("formats common bookmaker fractions exactly", () => {
    expect(formatFractionalOdds(2.1)).toBe("11/10");
    expect(formatFractionalOdds(2.2)).toBe("6/5");
    expect(formatFractionalOdds(3.5)).toBe("5/2");
    expect(formatFractionalOdds(2.5)).toBe("3/2");
    expect(formatFractionalOdds(2.5)).toBe("3/2");
    expect(formatFractionalOdds(1.5)).toBe("1/2");
  });

  it("never renders an unwieldy fraction for a near-round decimal (the reported bug)", () => {
    // 6.99 is 1p short of an exact 6/1 (7.00) - should still read as 6/1,
    // not reduce literally to 599/100.
    expect(formatFractionalOdds(6.99)).toBe("6/1");
    const { numerator, denominator } = decimalToFraction(6.99);
    expect(denominator).toBeLessThanOrEqual(20);
    expect(`${numerator}/${denominator}`).not.toBe("599/100");
  });

  it("applies the same 1p tolerance consistently at the Evens boundary", () => {
    // 1.99 is 1p short of Evens (2.00) - same tolerance rule as the 6.99
    // case above, so it also simplifies to Evens rather than an ugly
    // fraction. This is intentionally consistent, not a special case.
    expect(formatFractionalOdds(1.99)).toBe("Evens");
  });

  it("keeps very short prices as their exact fraction when no nice fraction is within tolerance", () => {
    expect(formatFractionalOdds(1.01)).toBe("1/100");
  });

  it("falls back to the closest nice fraction for a decimal with no clean small-denominator match", () => {
    // 1.87 doesn't reduce to a small denominator (87/100, gcd 1) and isn't
    // within 1p of a whole number, so it resolves to the closest fraction
    // with denominator <= 20 rather than the literal 87/100.
    const { denominator } = decimalToFraction(1.87);
    expect(denominator).toBeLessThanOrEqual(20);
  });

  it("returns 0/1 for decimal odds at or below 1.00", () => {
    expect(formatFractionalOdds(1.0)).toBe("0/1");
    expect(decimalToFraction(1.0)).toEqual({ numerator: 0, denominator: 1 });
  });
});
