import { createClient } from "@/lib/supabase-server";
import UploadForm from "./UploadForm";

// Upload (SPEC.md §6.1 #2) — admin-only. Players post their slip on
// WhatsApp; the admin uploads it here. Protected by middleware.ts
// (everything under /admin/* requires the admin auth session).
export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const supabase = createClient();

  const [{ data: players }, { data: bookmakers }] = await Promise.all([
    supabase.from("players").select("id, name").eq("active", true).order("name"),
    supabase.from("bookmakers").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-accent">Upload Betting Slip</h1>
      <p className="text-white/70">
        Pick who placed the bet, the bookmaker, and a photo of the slip. We&apos;ll read the
        details automatically — you&apos;ll get a chance to check them before they&apos;re saved.
      </p>
      <UploadForm players={players ?? []} bookmakers={bookmakers ?? []} />
    </div>
  );
}
