import { z } from "zod";

// Shape we ask Claude's vision extraction to return, and what a betslip photo
// realistically yields: OCR on a phone photo can miss/mis-read fields, so
// everything is optional/nullable here. src/lib/extract-bet.ts decides what
// counts as "good enough" to save without review vs what needs a human eye.
// See SPEC.md §5 for the canonical (strict) bets/bet_legs schema this feeds.

export const LEAGUE_CODES = ["PL", "CHAMPIONSHIP", "LEAGUE_ONE", "LEAGUE_TWO", "FA_CUP", "EFL_CUP"] as const;
export const PREDICTED_OUTCOMES = ["HOME_WIN", "AWAY_WIN", "DRAW"] as const;

export const looseLegSchema = z.object({
  leg_number: z.number().int().min(1).max(3).nullable().optional(),
  league: z.enum(LEAGUE_CODES).nullable().optional(),
  home_team: z.string().min(1).nullable().optional(),
  away_team: z.string().min(1).nullable().optional(),
  match_datetime: z.string().min(1).nullable().optional(),
  predicted_outcome: z.enum(PREDICTED_OUTCOMES).nullable().optional(),
  odds: z.number().nullable().optional(),
  // The fraction exactly as printed on the slip (e.g. "20/23"), kept purely
  // for display (src/lib/odds-format.ts) - see migration 0009. Not used by
  // any scoring/settlement logic, which reads `odds` (decimal) only.
  odds_fraction: z.string().min(1).nullable().optional(),
});

export const looseExtractionSchema = z.object({
  bet_date: z.string().min(1).nullable().optional(),
  stake: z.number().nullable().optional(),
  slip_return_amount: z.number().nullable().optional(),
  legs: z.array(looseLegSchema).nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]).nullable().optional(),
  extraction_notes: z.string().nullable().optional(),
});

export type LooseLeg = z.infer<typeof looseLegSchema>;
export type LooseExtraction = z.infer<typeof looseExtractionSchema>;

// The group's house rule (SPEC.md §3 point 3) wants every leg at evens or
// better, but §3.10 is explicit: the app never rejects a leg for breaking
// this — it records the real odds and red-flags it instead. This constant
// drives that flag; it does NOT gate whether a leg can be saved.
export const MINIMUM_ODDS = 2.0;

export function isBelowMinimumOdds(odds: number): boolean {
  return odds < MINIMUM_ODDS;
}

// `Required<LooseLeg>` only strips the `?` (optional) modifiers — it does
// NOT strip `| null`, since every field here is `nullable().optional()`.
// This is the actually-non-nullable shape a complete leg narrows to.
export type CompleteLeg = {
  leg_number?: number | null;
  league: (typeof LEAGUE_CODES)[number];
  home_team: string;
  away_team: string;
  match_datetime: string;
  predicted_outcome: (typeof PREDICTED_OUTCOMES)[number];
  odds: number;
};

// A leg is complete enough to insert into bet_legs (NOT NULL on every field
// below, and odds must be a real positive price — see §3.10) only if every
// field parsed cleanly. Being priced under evens does NOT make a leg
// incomplete; only a missing/invalid field does.
export function legIsComplete(leg: LooseLeg): leg is CompleteLeg {
  return (
    !!leg.league &&
    !!leg.home_team &&
    !!leg.away_team &&
    !!leg.match_datetime &&
    !!leg.predicted_outcome &&
    typeof leg.odds === "number" &&
    leg.odds > 0
  );
}
