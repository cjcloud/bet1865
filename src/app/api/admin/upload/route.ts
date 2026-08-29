import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { extractBetFromImage } from "@/lib/extract-bet";
import { legIsComplete, isBelowMinimumOdds } from "@/lib/bet-schema";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB, generous for a phone photo
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

// Handles Upload (SPEC.md §6.1 #2), admin-only (see middleware.ts — this
// route now lives under /api/admin/*, protected the same as /admin/* pages,
// with a 401 JSON response instead of a redirect for an unauthenticated
// fetch): stores the slip image in the private `betslips` bucket, runs
// Claude vision extraction, and inserts the bet as `pending_review` with
// whatever fields parsed cleanly — never silently dropped, per SPEC.md
// §6.2 error handling. The confirm screen (/admin/upload/confirm/[id])
// then lets the admin eyeball/fix it.
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const playerId = formData.get("player_id");
    let bookmakerId = formData.get("bookmaker_id");
    const newBookmakerName = formData.get("new_bookmaker_name");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No slip image provided." }, { status: 400 });
    }
    if (typeof playerId !== "string" || !playerId) {
      return NextResponse.json({ error: "Player is required." }, { status: 400 });
    }
    if (
      (typeof bookmakerId !== "string" || !bookmakerId) &&
      (typeof newBookmakerName !== "string" || !newBookmakerName.trim())
    ) {
      return NextResponse.json({ error: "Bookmaker is required." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Image is too large (max 10MB)." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: `Unsupported image type: ${file.type || "unknown"}` }, { status: 400 });
    }

    const supabase = createAdminClient();

    if ((typeof bookmakerId !== "string" || !bookmakerId) && typeof newBookmakerName === "string") {
      const { data: newBookmaker, error: bookmakerError } = await supabase
        .from("bookmakers")
        .upsert({ name: newBookmakerName.trim() }, { onConflict: "name" })
        .select("id")
        .single();
      if (bookmakerError || !newBookmaker) {
        return NextResponse.json(
          { error: `Could not create bookmaker: ${bookmakerError?.message ?? "unknown error"}` },
          { status: 500 }
        );
      }
      bookmakerId = newBookmaker.id;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    const ext = file.name.split(".").pop() || "jpg";
    const path = `${playerId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("betslips")
      .upload(path, bytes, { contentType: file.type, upsert: false });

    if (uploadError) {
      return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Vision extraction. If Claude/parsing fails outright, we still save the
    // bet as pending_review with no legs rather than losing the upload.
    let raw = "";
    let parsed = null as Awaited<ReturnType<typeof extractBetFromImage>>["parsed"];
    let extractionError: string | null = null;
    try {
      const base64 = Buffer.from(bytes).toString("base64");
      const result = await extractBetFromImage(base64, file.type);
      raw = result.raw;
      parsed = result.parsed;
      extractionError = result.parseError;
    } catch (err) {
      extractionError = err instanceof Error ? err.message : "AI extraction failed";
    }

    const today = new Date().toISOString().slice(0, 10);
    const betDate = parsed?.bet_date || today;
    const stake = typeof parsed?.stake === "number" ? parsed.stake : 10.0;
    const slipReturnAmount = typeof parsed?.slip_return_amount === "number" ? parsed.slip_return_amount : 0;

    const notes: string[] = [];
    if (extractionError) notes.push(`AI extraction issue: ${extractionError}`);
    if (parsed?.extraction_notes) notes.push(parsed.extraction_notes);

    const { data: bet, error: insertBetError } = await supabase
      .from("bets")
      .insert({
        player_id: playerId,
        bookmaker_id: bookmakerId,
        bet_date: betDate,
        slip_image_path: path,
        stake,
        slip_return_amount: slipReturnAmount,
        status: "pending_review",
        parsed_by_ai: true,
        ai_raw_response: { raw, parsed, extraction_error: extractionError },
        admin_verified: false,
        admin_notes: notes.length ? notes.join(" | ") : null,
      })
      .select("id")
      .single();

    if (insertBetError || !bet) {
      return NextResponse.json(
        { error: `Could not save bet: ${insertBetError?.message ?? "unknown error"}` },
        { status: 500 }
      );
    }

    const legs = parsed?.legs ?? [];
    const legWarnings: string[] = [];
    let legNumberFallback = 1;

    for (const leg of legs) {
      const legNumber = leg.leg_number ?? legNumberFallback;
      legNumberFallback = legNumber + 1;

      if (!legIsComplete(leg)) {
        legWarnings.push(`Leg ${legNumber}: incomplete extraction, needs manual entry.`);
        continue;
      }

      // Captured before the `await` below: TS drops narrowing from a
      // user-defined type guard across an await boundary, so `leg.odds`
      // would otherwise widen back to `number | null` afterwards.
      const odds = leg.odds;

      const { error: legError } = await supabase.from("bet_legs").insert({
        bet_id: bet.id,
        leg_number: legNumber,
        league: leg.league,
        home_team: leg.home_team,
        away_team: leg.away_team,
        match_datetime: leg.match_datetime,
        predicted_outcome: leg.predicted_outcome,
        odds,
        status: "pending",
      });

      if (legError) {
        legWarnings.push(`Leg ${legNumber}: ${legError.message}`);
      } else if (isBelowMinimumOdds(odds)) {
        // Recorded as-is per SPEC.md §3.10 — never rejected, just flagged.
        legWarnings.push(`Leg ${legNumber}: RED FLAG — odds ${odds.toFixed(2)} is below the 2.0 evens minimum.`);
      }
    }

    if (legWarnings.length) {
      const combinedNotes = [notes.join(" | "), legWarnings.join(" | ")].filter(Boolean).join(" | ");
      await supabase.from("bets").update({ admin_notes: combinedNotes }).eq("id", bet.id);
    }

    return NextResponse.json({ betId: bet.id, warnings: legWarnings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error during upload." },
      { status: 500 }
    );
  }
}
