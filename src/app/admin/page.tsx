import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import SignOutButton from "@/components/SignOutButton";

export default async function AdminPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-accent">Admin</h1>
        <SignOutButton />
      </div>
      <p className="text-white/70">Signed in as {user?.email}.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded border border-white/10 bg-surface p-4">
          <h2 className="font-semibold text-white">Upload a Bet Slip</h2>
          <p className="mt-1 text-sm text-white/60">
            Players post their slip in the WhatsApp group — upload the photo here
            and Claude reads the details automatically.
          </p>
          <Link
            href="/admin/upload"
            className="mt-3 inline-flex min-h-[44px] items-center rounded bg-accent px-4 font-semibold text-black"
          >
            Upload Slip
          </Link>
        </div>

        <div className="rounded border border-white/10 bg-surface p-4">
          <h2 className="font-semibold text-white">All Bets</h2>
          <p className="mt-1 text-sm text-white/60">
            Settle legs Won/Lost/Void, reconcile a Void bet, or delete a duplicate
            or mistaken entry (SPEC.md §3.9a, §3.7a, §6.3).
          </p>
          <Link
            href="/admin/bets"
            className="mt-3 inline-flex min-h-[44px] items-center rounded bg-accent px-4 font-semibold text-black"
          >
            View All Bets
          </Link>
        </div>
      </div>

      <p className="text-white/50 text-sm">
        Full field-by-field amend of a saved bet (player, bookmaker, stake, etc.
        beyond what settlement touches) still to come (Phase 6, see
        BUILD_TEST_DEPLOY_PLAN.md).
      </p>
    </div>
  );
}
