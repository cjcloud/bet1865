import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client (RSC / route handlers). Uses the anon key by
// default; use supabase-admin.ts for service-role operations (settlement job,
// admin writes) per SPEC.md §6.2 RLS rules.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // See the matching comment in supabase-admin.ts - without this,
      // Next.js's server fetch cache can serve a stale GET response
      // (e.g. a bets/bet_legs read from moments after a row was created,
      // before it had its final data) indefinitely on this route.
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component; middleware refreshes sessions instead
          }
        },
      },
    }
  );
}
