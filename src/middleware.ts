import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Protects /admin/* per SPEC.md §6.1 — players have no login, only the Admin
// route is authenticated. Magic-link sign-in only works for the pre-created
// admin user because "Allow new user signups" is disabled in Supabase Auth
// settings (see README.md for the one-time setup steps).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtectedAdminPage = pathname.startsWith("/admin") && pathname !== "/admin/login";
  const isProtectedAdminApi = pathname.startsWith("/api/admin");

  if ((isProtectedAdminPage || isProtectedAdminApi) && !user) {
    if (isProtectedAdminApi) {
      // An API route is called via fetch() from client code (e.g.
      // UploadForm.tsx), which expects a JSON response - a redirect would
      // just surface as an opaque network/parse error there instead of a
      // clear "you're not signed in".
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Admin pages (upload, settlement, correction tooling — SPEC.md §6.1 #5)
  // and the admin-only API routes they call (currently just the slip-upload
  // endpoint) are both hidden from general users and require the single
  // pre-created admin account to be signed in (SPEC.md §6 "Auth"). Everything
  // else (Ranking, View Slips, Rules) stays public/unauthenticated.
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
