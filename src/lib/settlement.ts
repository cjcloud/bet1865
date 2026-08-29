// Phase 4 — manual settlement roll-up. SPEC.md §3.7, §3.7a, §3.9a, §4.
//
// Deliberately isolated from any UI/DB code so it's a plain, unit-testable
// function of "legs in, bet status/winnings out" (see Phase 7 of
// BUILD_TEST_DEPLOY_PLAN.md). It is bookmaker-agnostic: by the time a leg
// reaches here it's already a final Won/Lost/Void status — the Betfair
// 90-minute rule (§3.8) is applied entirely on Betfair's own site before the
// admin ever transcribes a status into this app, so there is no
// Betfair-specific branch here.

export type LegStatus = "pending" | "won" | "lost" | "void";
export type BetStatus = "pending_review" | "pending_settlement" | "won" | "lost" | "void";
export type BetReconciliation = "standard" | "voided_full_refund" | "manual_bookmaker_return";

export interface BetRollup {
  status: BetStatus;
  winnings: number | null;
}

/**
 * §3.7 / §3.9a's plain roll-up — only valid when NO leg is Void (callers
 * must check for a void leg first and route to `applyVoidReconciliation`
 * instead; see `hasVoidLeg`).
 *
 * - any leg lost  -> bet lost, winnings = 0
 * - all legs won  -> bet won, winnings = the slip's stated return amount
 *   (never recalculated from odds — see §3.7)
 * - otherwise (any leg still pending) -> bet stays pending_settlement
 */
export function deriveBetRollup(legStatuses: LegStatus[], slipReturnAmount: number): BetRollup {
  if (legStatuses.some((s) => s === "void")) {
    throw new Error(
      "deriveBetRollup cannot be used when a leg is void — use applyVoidReconciliation (SPEC.md §3.7a)"
    );
  }

  if (legStatuses.some((s) => s === "lost")) {
    return { status: "lost", winnings: 0 };
  }

  if (legStatuses.every((s) => s === "won")) {
    return { status: "won", winnings: slipReturnAmount };
  }

  return { status: "pending_settlement", winnings: null };
}

export function hasVoidLeg(legStatuses: LegStatus[]): boolean {
  return legStatuses.some((s) => s === "void");
}

export interface VoidReconciliationResult {
  status: BetStatus;
  winnings: number;
  reconciliation: BetReconciliation;
}

/**
 * §3.7a — required whenever any leg on a bet is Void. Two mutually
 * exclusive admin choices; either can be re-chosen later, which simply
 * re-runs this function with the new choice (the caller overwrites the
 * bet's stored status/winnings/reconciliation each time — idempotent).
 */
export function applyVoidReconciliation(
  action: { type: "void_whole_bet"; stake: number } | { type: "manual_bookmaker_return"; amount: number }
): VoidReconciliationResult {
  if (action.type === "void_whole_bet") {
    return { status: "void", winnings: action.stake, reconciliation: "voided_full_refund" };
  }

  // manual_bookmaker_return: stored as-is, no further recalculation.
  // status derives from whether the entered figure is nonzero.
  return {
    status: action.amount > 0 ? "won" : "lost",
    winnings: action.amount,
    reconciliation: "manual_bookmaker_return",
  };
}

/**
 * Un-voiding a leg (correcting a mistaken Void back to Won/Lost) clears any
 * §3.7a reconciliation back to 'standard' and lets the normal roll-up take
 * over again once all three legs are Won/Lost (SPEC.md §3.7a, last
 * paragraph). Callers should call this instead of applyVoidReconciliation
 * whenever a leg edit removes the last void leg from a bet.
 */
export function clearReconciliation(legStatuses: LegStatus[], slipReturnAmount: number): BetRollup & {
  reconciliation: BetReconciliation;
} {
  return { ...deriveBetRollup(legStatuses, slipReturnAmount), reconciliation: "standard" };
}
