import { describe, expect, it } from "vitest";
import {
  applyVoidReconciliation,
  clearReconciliation,
  deriveBetRollup,
  hasVoidLeg,
} from "./settlement";

describe("deriveBetRollup", () => {
  it("settles a bet lost when any single leg is lost, regardless of the other two", () => {
    expect(deriveBetRollup(["lost", "won", "won"], 45)).toEqual({ status: "lost", winnings: 0 });
    expect(deriveBetRollup(["won", "lost", "pending"], 45)).toEqual({ status: "lost", winnings: 0 });
  });

  it("settles a bet won at the slip's stated return when all three legs win", () => {
    expect(deriveBetRollup(["won", "won", "won"], 45)).toEqual({ status: "won", winnings: 45 });
  });

  it("never recalculates winnings from odds — the slip figure is authoritative", () => {
    expect(deriveBetRollup(["won", "won", "won"], 123.45)).toEqual({
      status: "won",
      winnings: 123.45,
    });
  });

  it("stays pending_settlement while any leg is still pending and none has lost", () => {
    expect(deriveBetRollup(["won", "pending", "pending"], 45)).toEqual({
      status: "pending_settlement",
      winnings: null,
    });
    expect(deriveBetRollup(["pending", "pending", "pending"], 45)).toEqual({
      status: "pending_settlement",
      winnings: null,
    });
  });

  it("is idempotent — re-deriving from the same final leg statuses gives the same result", () => {
    const first = deriveBetRollup(["won", "lost", "won"], 45);
    const second = deriveBetRollup(["won", "lost", "won"], 45);
    expect(second).toEqual(first);
  });

  it("refuses to run when any leg is void — callers must use applyVoidReconciliation", () => {
    expect(() => deriveBetRollup(["void", "won", "won"], 45)).toThrow();
  });
});

describe("hasVoidLeg", () => {
  it("detects a void leg anywhere in the three", () => {
    expect(hasVoidLeg(["won", "won", "won"])).toBe(false);
    expect(hasVoidLeg(["won", "void", "pending"])).toBe(true);
  });
});

describe("applyVoidReconciliation", () => {
  it("voiding the whole bet refunds the stake and excludes it from scoring status", () => {
    expect(applyVoidReconciliation({ type: "void_whole_bet", stake: 10 })).toEqual({
      status: "void",
      winnings: 10,
      reconciliation: "voided_full_refund",
    });
  });

  it("a nonzero bookmaker return settles the bet as won for that exact figure", () => {
    expect(applyVoidReconciliation({ type: "manual_bookmaker_return", amount: 18.5 })).toEqual({
      status: "won",
      winnings: 18.5,
      reconciliation: "manual_bookmaker_return",
    });
  });

  it("a zero bookmaker return settles the bet as lost", () => {
    expect(applyVoidReconciliation({ type: "manual_bookmaker_return", amount: 0 })).toEqual({
      status: "lost",
      winnings: 0,
      reconciliation: "manual_bookmaker_return",
    });
  });
});

describe("clearReconciliation", () => {
  it("un-voiding back to a fully won/lost bet resets reconciliation to standard and re-derives normally", () => {
    expect(clearReconciliation(["won", "won", "won"], 45)).toEqual({
      status: "won",
      winnings: 45,
      reconciliation: "standard",
    });
    expect(clearReconciliation(["lost", "won", "won"], 45)).toEqual({
      status: "lost",
      winnings: 0,
      reconciliation: "standard",
    });
  });

  it("un-voiding to a still-incomplete bet resets reconciliation but leaves it pending_settlement", () => {
    expect(clearReconciliation(["won", "pending", "won"], 45)).toEqual({
      status: "pending_settlement",
      winnings: null,
      reconciliation: "standard",
    });
  });
});
