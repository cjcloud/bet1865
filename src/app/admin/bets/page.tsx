import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-admin";
import DeleteBetButton from "@/components/DeleteBetButton";
import SelectAllCheckbox from "@/components/SelectAllCheckbox";
import BatchDeleteButton from "@/components/BatchDeleteButton";
import { batchDeleteBetsAction } from "./actions";

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

// Admin's full bet list - amend/delete tooling (SPEC.md §6.1, §6.3). Single
// and batch delete are both live here (batch added 30 Aug 2026, Phase 6);
// full field-by-field amend lives on the confirm/edit screen, reached via
// each bet's own detail/settlement page.
export default async function AdminBetsPage({
  searchParams,
}: {
  searchParams: { player?: string; deleted?: string; failed?: string };
}) {
  const supabase = createAdminClient();

  const { data: players } = await supabase
    .from("players")
    .select("id, name")
    .order("name");

  let betsQuery = supabase
    .from("bets")
    .select("id, bet_date, status, stake, slip_return_amount, player_id, bookmaker_id, created_at")
    .order("bet_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-accent">All Bets</h1>
        <Link href="/admin" className="text-sm text-white/50 underline">
          Back to Admin
        </Link>
      </div>

      {searchParams.deleted && (
        <p className="rounded border border-green-500/40 bg-green-500/10 px-3 py-2 text-sm text-green-300">
          {Number(searchParams.deleted) > 1
            ? `${searchParams.deleted} bet slips deleted.`
            : "Bet slip deleted."}
          {searchParams.failed && (
            <span className="text-yellow-300">
              {" "}
              {searchParams.failed} could not be deleted — check the server logs.
            </span>
          )}
        </p>
      )}

      <p className="text-white/70">
        Every uploaded slip, including duplicates or mistaken entries. Deletion is
        permanent &mdash; it is logged to the audit trail first, but there is no
        in-app undo (SPEC.md &sect;6.3).
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/bets"
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
            href={`/admin/bets?player=${p.id}`}
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
        <p className="text-white/50 text-sm">No slips uploaded yet.</p>
      ) : (
        <form action={batchDeleteBetsAction} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 bg-surface px-4 py-2">
            <SelectAllCheckbox />
            <BatchDeleteButton />
          </div>

          <div className="space-y-3">
            {bets.map((bet) => (
              <div
                key={bet.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 bg-surface px-4 py-3"
              >
                <input
                  type="checkbox"
                  name="bet_ids"
                  value={bet.id}
                  aria-label={`Select ${playerNameById.get(bet.player_id) ?? "Unknown"}'s ${new Date(
                    bet.bet_date
                  ).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} bet for batch delete`}
                  className="h-4 w-4 shrink-0"
                />
                <Link href={`/bets/${bet.id}`} className="min-w-0 flex-1 hover:opacity-80">
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
                </Link>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${
                    STATUS_STYLES[bet.status] ?? "border-white/20 text-white/70"
                  }`}
                >
                  {STATUS_LABELS[bet.status] ?? bet.status}
                </span>
                <Link
                  href={`/admin/bets/${bet.id}`}
                  className="min-h-[36px] shrink-0 flex items-center rounded border border-accent/60 px-3 text-sm font-medium text-accent hover:bg-accent/10"
                >
                  Settle
                </Link>
                <DeleteBetButton
                  betId={bet.id}
                  label={`${playerNameById.get(bet.player_id) ?? "Unknown"} · ${new Date(
                    bet.bet_date
                  ).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                />
              </div>
            ))}
          </div>
        </form>
      )}
    </div>
  );
}
