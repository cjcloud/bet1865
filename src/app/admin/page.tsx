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

      <div className="rounded border border-white/10 bg-surface p-4">
        <h2 className="font-semibold text-white">All Bets</h2>
        <p className="mt-1 text-sm text-white/60">
          Browse every uploaded slip and delete duplicates or mistaken entries
          (SPEC.md §6.3).
        </p>
        <Link
          href="/admin/bets"
          className="mt-3 inline-flex min-h-[44px] items-center rounded bg-accent px-4 font-semibold text-black"
        >
          View All Bets
        </Link>
      </div>

      <p className="text-white/50 text-sm">
        Leg Won/Lost/Void controls, void reconciliation, and full field-by-field
        amend still to come (Phase 6, see BUILD_TEST_DEPLOY_PLAN.md).
      </p>
    </div>
  );
}
