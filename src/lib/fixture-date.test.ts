import { describe, expect, it } from "vitest";
import { correctNearTermYear } from "./fixture-date";

describe("correctNearTermYear", () => {
  it("corrects a year the AI defaulted to (the reported bug): 2024-09-19 uploaded in Sep 2026 should become 2026-09-19", () => {
    const reference = new Date("2026-09-18T18:53:15.723Z");
    expect(correctNearTermYear("2024-09-19T15:00:00", reference)).toBe("2026-09-19T15:00:00");
  });

  it("leaves an already-correct year untouched", () => {
    const reference = new Date("2026-09-18T18:53:15.723Z");
    expect(correctNearTermYear("2026-09-19T15:00:00", reference)).toBe("2026-09-19T15:00:00");
  });

  it("rolls forward into next year for a slip uploaded right before New Year's", () => {
    // Uploaded 29 Dec 2026, fixture on 2 Jan - nearest year for day/month
    // "01-02" is 2027, not 2026 (11 months away) or 2025 (a year away).
    const reference = new Date("2026-12-29T12:00:00Z");
    expect(correctNearTermYear("2024-01-02T15:00:00", reference)).toBe("2027-01-02T15:00:00");
  });

  it("rolls back into the previous year for a slip uploaded right after New Year's", () => {
    // Uploaded 2 Jan 2027, fixture on 30 Dec - nearest year for day/month
    // "12-30" is 2026, not 2027 (a year away).
    const reference = new Date("2027-01-02T12:00:00Z");
    expect(correctNearTermYear("2024-12-30T15:00:00", reference)).toBe("2026-12-30T15:00:00");
  });

  it("returns the input unchanged if it isn't a parseable YYYY-MM-DD... string", () => {
    expect(correctNearTermYear("not a date", new Date())).toBe("not a date");
  });
});
