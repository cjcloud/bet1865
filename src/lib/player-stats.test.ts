import { describe, expect, it } from "vitest";
import { computeStreak, legsWonDistribution, winRate } from "./player-stats";

describe("computeStreak", () => {
  it("returns null/0 when there are no settled bets", () => {
    expect(computeStreak([])).toEqual({ type: null, length: 0 });
  });

  it("counts the run of consecutive same results from the most recent bet", () => {
    expect(computeStreak(["won", "won", "lost"])).toEqual({ type: "won", length: 2 });
    expect(computeStreak(["lost", "lost", "lost", "won"])).toEqual({ type: "lost", length: 3 });
  });

  it("a single settled bet is a streak of length 1", () => {
    expect(computeStreak(["won"])).toEqual({ type: "won", length: 1 });
  });

  it("stops counting at the first different result", () => {
    expect(computeStreak(["won", "lost", "won", "won"])).toEqual({ type: "won", length: 1 });
  });
});

describe("legsWonDistribution", () => {
  it("buckets bets by how many legs won, 0 through 3", () => {
    expect(legsWonDistribution([3, 3, 2, 0, 1, 3])).toEqual([1, 1, 1, 3]);
  });

  it("returns all-zero buckets for no bets", () => {
    expect(legsWonDistribution([])).toEqual([0, 0, 0, 0]);
  });

  it("ignores out-of-range values defensively", () => {
    expect(legsWonDistribution([3, -1, 4])).toEqual([0, 0, 0, 1]);
  });
});

describe("winRate", () => {
  it("returns null when no bets are settled, to distinguish from a real 0%", () => {
    expect(winRate(0, 0)).toBeNull();
  });

  it("computes a percentage", () => {
    expect(winRate(1, 4)).toBe(25);
    expect(winRate(2, 4)).toBe(50);
  });
});
