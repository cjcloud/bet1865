import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "betc*nt | Bet1865",
  description: "Weekly treble bet tracker and betc*nt league table.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-white antialiased">
        <header className="border-b border-white/10 bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-betcnt.png" alt="betc*nt" className="h-8 w-auto" />
            </a>
            <nav className="flex gap-6 text-sm font-medium text-white/80">
              <a href="/" className="hover:text-accent">Ranking</a>
              <a href="/upload" className="hover:text-accent">Upload Slip</a>
              <a href="/rules" className="hover:text-accent">Rules</a>
              <a href="/admin" className="hover:text-accent">Admin</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
