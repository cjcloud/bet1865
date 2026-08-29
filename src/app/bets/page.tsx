import Link from "next/link";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  pending_settlement: "Awaiting result",
  won: "Won",
  lost: "Lost",
  void: "Void",
};

const STATUS_STYLES: Record<string, string> = {
  pending_review: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  pending_settlement: "bg-white/10 text-white/70 border-white/20",
  won: "bg-green-500/20 text-green-300 border-green-500/40",
  lost: "bg-red-500/20 text-red-300 border-red-500/40",
  void: "bg-white/10 text-white/50 border-white/20",
};

// Browse uploaded slips by player. Public, no auth — same as Rules/Ranking
// (SPEC.md §6 "Auth"). Uploading is admin-only (players post their slip on
// WhatsApp and the admin uploads it via /admin/upload), so this page is
// read-only for a general visitor.
export default async function BetsPage({
  searchParams,
}: {
  searchParams: { player?: string };
}) {
  const supabase = createClient();

  const { data: players } = await supabase
    .from("players")
    .select("id, name")
    .eq("active", true)
    .order("name");

  let betsQuery = supabase
    .from("bets")
    .select("id, bet_date, status, stake, slip_return_amount, player_id, bookmaker_id, created_at")
    .order("bet_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (searchParams.player) {
    betsQuery = betsQuery.eq("player_id", searchParams.player);
  }

  const { data: bets } = await betsQuery;

  const playerNameById = new Map((players ?? []).map((p) => [p.id, p.name]));

  const bookmakerIds = Array.from(new Set((bets ?? []).map((b) => b.bookmaker_id)));
  const { data: bookmakers } = bookmakerIds.length
    ? await supabase.from("bookmakers").select("id, name").in("id", bookmakerIds)
    : { data: [] as { id: string; name: string }[] };
  const bookmakerNameById = new Map((bookmakers ?? []).map((b) => [b.id, b.name]));

  const selectedPlayer = searchParams.player
    ? (players ?? []).find((p) => p.id === searchParams.player)
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-accent">Uploaded Slips</h1>
      <p className="text-white/70">Browse every slip that&apos;s been uploaded, by player.</p>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/bets"
          className={`min-h-[36px] flex items-center rounded-full border px-3 text-sm ${
            !searchParams.player
              ? "border-accent bg-accent/10 text-accent"
              : "border-white/20 text-white/70 hover:border-white/40"
          }`}
        >
          Everyone
        </Link>
        {(players ?? []).map((p) => (
          <Link
            key={p.id}
            href={`/bets?player=${p.id}`}
            className={`min-h-[36px] flex items-center rounded-full border px-3 text-sm ${
              searchParams.player === p.id
                ? "border-accent bg-accent/10 text-accent"
                : "border-white/20 text-white/70 hover:border-white/40"
            }`}
          >
            {p.name}
          </Link>
        ))}
      </div>

      {!bets?.length ? (
        <p className="text-white/50 text-sm">
          {selectedPlayer ? `No slips uploaded for ${selectedPlayer.name} yet.` : "No slips uploaded yet."}
        </p>
      ) : (
        <div className="space-y-3">
          {bets.map((bet) => (
            <Link
              key={bet.id}
              href={`/bets/${bet.id}`}
              className="flex items-center justify-between gap-3 rounded border border-white/10 bg-surface px-4 py-3 hover:border-accent/50"
            >
              <div>
                <div className="font-medium text-white">
                  {playerNameById.get(bet.player_id) ?? "Unknown player"} ·{" "}
                  {bookmakerNameById.get(bet.bookmaker_id) ?? "Unknown bookmaker"}
                </div>
                <div className="text-sm text-white/50">
                  {new Date(bet.bet_date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  · £{Number(bet.stake).toFixed(2)} stake · £{Number(bet.slip_return_amount).toFixed(2)}{" "}
                  potential return
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
                  STATUS_STYLES[bet.status] ?? "border-white/20 text-white/70"
                }`}
              >
                {STATUS_LABELS[bet.status] ?? bet.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
