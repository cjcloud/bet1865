import type { Metadata } from "next";
import "./globals.css";
import MobileNav from "@/components/MobileNav";
import { createClient } from "@/lib/supabase-server";

export const metadata: Metadata = {
  title: "betc*nt | Bet1865",
  description: "Weekly treble bet tracker and betc*nt league table.",
};

// Admin (upload, settle, correct bets — SPEC.md §6.1 #5) is hidden from
// general users, not just auth-gated: signed-out visitors never see an
// "Admin" link at all, so there's no visible entry point hinting it exists.
// Players don't upload their own slips either (they post the slip on
// WhatsApp; the admin uploads it) so "Upload Slip" isn't public nav either -
// it lives inside /admin now. This check runs server-side on every
// navigation (no client JS / flash of the wrong nav), same cookie-based
// session middleware.ts already checks.
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = !!user;

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-white antialiased">
        <header className="relative border-b border-white/10 bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-betcnt.png"
                alt="betc*nt"
                className="h-7 w-auto sm:h-8"
              />
            </a>

            {/* Desktop/tablet nav: inline links from `sm` up */}
            <nav className="hidden items-center gap-x-6 text-sm font-medium text-white/80 sm:flex">
              <a href="/ranking" className="hover:text-accent">Ranking</a>
              <a href="/bets" className="hover:text-accent">View Slips</a>
              <a href="/rules" className="hover:text-accent">Rules</a>
              {isAdmin && (
                <a href="/admin" className="hover:text-accent">Admin</a>
              )}
            </nav>

            {/* Mobile nav: collapses to a hamburger below `sm` */}
            <MobileNav isAdmin={isAdmin} />
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
