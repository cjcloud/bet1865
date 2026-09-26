import { describe, expect, it } from "vitest";
import { correctNearTermYear, correctPastYear } from "./fixture-date";

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

// A settled slip's fixtures have all been played, so a wrong year must never
// land a leg in the future - that would make a concluded fixture look
// unplayed and, months back, nearest-year logic picks the wrong season.
describe("correctPastYear", () => {
  it("keeps a fixture months in the past in the past (nearest-year would jump to next year)", () => {
    // Uploaded 26 Sep 2026 for a 14 Feb fixture: nearest year is 2027
    // (4.5 months ahead), but the match has been played, so it's 2026.
    const reference = new Date("2026-09-26T12:00:00Z");
    expect(correctPastYear("2024-02-14T15:00:00", reference)).toBe("2026-02-14T15:00:00");
  });

  it("rolls back to last year when this year's day+month hasn't happened yet", () => {
    // Uploaded 26 Sep 2026 for a 20 Dec fixture - must be Dec 2025.
    const reference = new Date("2026-09-26T12:00:00Z");
    expect(correctPastYear("2026-12-20T15:00:00", reference)).toBe("2025-12-20T15:00:00");
  });

  it("keeps a fixture earlier the same day as the upload", () => {
    const reference = new Date("2026-09-26T18:00:00Z");
    expect(correctPastYear("2024-09-26T15:00:00Z", reference)).toBe("2026-09-26T15:00:00Z");
  });

  it("returns the input unchanged if it isn't a parseable YYYY-MM-DD... string", () => {
    expect(correctPastYear("not a date", new Date())).toBe("not a date");
  });
});
