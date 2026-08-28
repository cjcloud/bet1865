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
      <p className="text-white/70">
        Signed in as {user?.email}. Bet/leg correction tooling wired up in Phase 6
        (see BUILD_TEST_DEPLOY_PLAN.md).
      </p>
    </div>
  );
}
