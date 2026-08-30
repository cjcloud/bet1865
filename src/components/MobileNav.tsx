"use client";

import { useState } from "react";

const PUBLIC_LINKS = [
  { href: "/ranking", label: "Ranking" },
  { href: "/bets", label: "View Slips" },
  { href: "/rules", label: "Rules" },
];

// Admin is only ever shown once RootLayout (server-side) has confirmed an
// admin session exists — see the comment on RootLayout in layout.tsx for why
// it's hidden entirely rather than just link-protected.
const ADMIN_LINK = { href: "/admin", label: "Admin" };

// Collapses the nav to a hamburger below the `sm` breakpoint per SPEC.md §6.2.
export default function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const links = isAdmin ? [...PUBLIC_LINKS, ADMIN_LINK] : PUBLIC_LINKS;

  return (
    <div className="sm:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-accent"
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {open && (
        <nav className="absolute inset-x-0 top-full border-b border-white/10 bg-surface px-4 pb-4 pt-2 shadow-lg">
          <ul className="flex flex-col divide-y divide-white/10">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-[44px] items-center text-base font-medium text-white/80 hover:text-accent"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
