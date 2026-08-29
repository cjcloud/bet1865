import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for server-only code paths that must bypass RLS:
// the AI slip-parsing insert, the settlement job, and Admin-page writes.
// Never import this from client components. See SPEC.md §6.2.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      // Next.js's server fetch cache can otherwise cache a GET response from
      // this client (e.g. a bet_legs read moments after upload, before any
      // legs existed) and keep serving that stale snapshot indefinitely on
      // every later request for the same route, even after the underlying
      // rows change - `export const dynamic = "force-dynamic"` on the page
      // does not reliably reach fetches made inside an imported client like
      // this one. Forcing no-store here makes every read live.
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
