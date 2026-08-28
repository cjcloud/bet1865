import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for server-only code paths that must bypass RLS:
// the AI slip-parsing insert, the settlement job, and Admin-page writes.
// Never import this from client components. See SPEC.md §6.2.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
