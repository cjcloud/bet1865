import { z } from "zod";

// Shape we ask Claude's vision extraction to return, and what a betslip photo
// realistically yields: OCR on a phone photo can miss/mis-read fields, so
// everything is optional/nullable here. src/lib/extract-bet.ts decides what
// counts as "good enough" to save without review vs what needs a human eye.
// See SPEC.md §5 for the canonical (strict) bets/bet_legs schema this feeds.

export const LEAGUE_CODES = ["PL", "CHAMPIONSHIP", "LEAGUE_ONE", "LEAGUE_TWO"] as const;
export const PREDICTED_OUTCOMES = ["HOME_WIN", "AWAY_WIN", "DRAW"] as const;

export const looseLegSchema = z.object({
  leg_number: z.number().int().min(1).max(3).nullable().optional(),
  league: z.enum(LEAGUE_CODES).nullable().optional(),
  home_team: z.string().min(1).nullable().optional(),
  away_team: z.string().min(1).nullable().optional(),
  match_datetime: z.string().min(1).nullable().optional(),
  predicted_outcome: z.enum(PREDICTED_OUTCOMES).nullable().optional(),
  odds: z.number().nullable().optional(),
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

// A leg is complete/valid enough to insert into bet_legs (which has a DB
// check constraint odds >= 2.00 and NOT NULL on every field below) only if
// every field parsed cleanly.
export function legIsComplete(leg: LooseLeg): leg is Required<LooseLeg> {
  return (
    !!leg.league &&
    !!leg.home_team &&
    !!leg.away_team &&
    !!leg.match_datetime &&
    !!leg.predicted_outcome &&
    typeof leg.odds === "number" &&
    leg.odds >= 2.0
  );
}
