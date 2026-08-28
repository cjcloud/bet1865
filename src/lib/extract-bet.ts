import Anthropic from "@anthropic-ai/sdk";
import { looseExtractionSchema, type LooseExtraction } from "./bet-schema";

// Server-only. Calls Claude's vision API on an uploaded betslip photo and
// asks for structured JSON matching the bets/bet_legs fields (SPEC.md §5,
// §6: "Slip parsing"). The model id is deliberately NOT hardcoded with a
// guess — set ANTHROPIC_MODEL in Vercel/`.env.local` to a real, current
// vision-capable Claude model id (see BUILD_TEST_DEPLOY_PLAN.md's open
// decision #1). We fail loudly rather than silently call a wrong model.

const EXTRACTION_PROMPT = `You are extracting structured data from a photo of a football accumulator ("treble") bet slip from a UK bookmaker.

Return ONLY a single JSON object (no markdown fences, no commentary) with this exact shape:

{
  "bet_date": "YYYY-MM-DD or null if not visible on the slip",
  "stake": number (the stake in GBP, e.g. 10, or null),
  "slip_return_amount": number (the total potential return/payout printed on the slip if all legs win, or null),
  "confidence": "high" | "medium" | "low",
  "extraction_notes": "anything you're unsure about, or null",
  "legs": [
    {
      "leg_number": 1,
      "league": "PL" | "CHAMPIONSHIP" | "LEAGUE_ONE" | "LEAGUE_TWO" | null,
      "home_team": "string or null",
      "away_team": "string or null",
      "match_datetime": "best-effort ISO 8601 datetime you can infer (date + kickoff time), or null",
      "predicted_outcome": "HOME_WIN" | "AWAY_WIN" | "DRAW" | null,
      "odds": number (decimal odds for this leg, e.g. 2.5) or null
    }
  ]
}

Rules:
- There should be exactly 3 legs (this is always a treble). If you can only make out 1 or 2, still return however many you can read, each as its own object.
- "league" must be your best classification of which of the four English divisions the match is in (Premier League, EFL Championship, EFL League One, EFL League Two) based on team names/context — use null only if you genuinely cannot tell.
- "predicted_outcome" is which result the slip is betting on for that leg (home win / away win / draw), not the actual match result.
- If a field is illegible or absent, use null for that field rather than guessing a plausible-looking value.
- Set "confidence" to "low" if more than one field across the whole slip was illegible or ambiguous.`;

export async function extractBetFromImage(
  imageBase64: string,
  mediaType: string
): Promise<{ raw: string; parsed: LooseExtraction | null; parseError: string | null }> {
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    throw new Error(
      "ANTHROPIC_MODEL is not set. Set it to a current vision-capable Claude model id " +
        "in your environment variables before uploading slips."
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const message = await anthropic.messages.create({
    model,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
              data: imageBase64,
            },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";

  // Strip accidental markdown fences before parsing, just in case.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  try {
    const json = JSON.parse(cleaned);
    const result = looseExtractionSchema.safeParse(json);
    if (!result.success) {
      return { raw, parsed: null, parseError: result.error.message };
    }
    return { raw, parsed: result.data, parseError: null };
  } catch (err) {
    return { raw, parsed: null, parseError: err instanceof Error ? err.message : "JSON parse failed" };
  }
}
