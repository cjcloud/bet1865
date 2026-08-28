import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client, for client components (e.g. the admin login
// form and sign-out button). Uses the public anon key only — see SPEC.md §6.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
