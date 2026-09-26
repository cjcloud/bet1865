import { createClient } from "@/lib/supabase-server";
import UploadForm from "../UploadForm";

// Add a settled slip (SPEC.md §6.1 #3a) — admin-only, for entering a bet
// retrospectively after its fixtures have been played. Same upload as
// /admin/upload, but the slip's leg results are read too and entered on the
// confirm screen, so the bet is saved already settled.
export const dynamic = "force-dynamic";

export default async function UploadSettledPage() {
  const supabase = createClient();

  const [{ data: players }, { data: bookmakers }] = await Promise.all([
    supabase.from("players").select("id, name").eq("active", true).order("name"),
    supabase.from("bookmakers").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-accent">Add a Settled Slip</h1>
      <p className="text-white/70">
        For a bet whose fixtures have already been played. Upload the settled slip and we&apos;ll read
        the details and each leg&apos;s result — you&apos;ll check them, and fill in anything missing,
        before the bet is saved as settled.
      </p>
      <UploadForm players={players ?? []} bookmakers={bookmakers ?? []} settled />
    </div>
  );
}
