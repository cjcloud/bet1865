"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase-client";

// There is exactly one admin account for this app (SPEC.md §6 — single
// pre-created Supabase Auth user, "Allow new user signups" disabled so no
// other email could ever complete a sign-in even if it got this far). This
// client-side check is a UX layer on top of that real server-side gate: it
// stops a mistyped/other email from ever reaching Supabase and shows a
// clear "Access denied" message instead of a raw auth error — see the
// BUILD_TEST_DEPLOY_PLAN.md Handoff notes for why the Supabase-side signup
// restriction, not this check, is what actually enforces access.
const ADMIN_EMAIL = "cjdreaminfo@gmail.com";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "denied" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (email.trim().toLowerCase() !== ADMIN_EMAIL) {
      setStatus("denied");
      return;
    }

    setStatus("sending");

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: ADMIN_EMAIL,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signInError) {
      setStatus("error");
      setError(signInError.message);
      return;
    }

    setStatus("sent");
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-bold text-accent">Admin Login</h1>

      {status === "sent" ? (
        <p className="text-white/80">
          Check your email for a sign-in link. You can close this tab.
        </p>
      ) : status === "denied" ? (
        <div className="space-y-4">
          <p className="text-sm text-red-400">
            Access denied. This admin area is restricted to a single pre-authorised
            account.
          </p>
          <button
            type="button"
            onClick={() => {
              setStatus("idle");
              setEmail("");
            }}
            className="min-h-[44px] w-full rounded-md border border-white/20 px-4 py-2 font-semibold text-white hover:border-accent"
          >
            Try again
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm text-white/70">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-[44px] w-full rounded-md border border-white/20 bg-surfaceAlt px-3 py-2 text-white outline-none focus:border-accent"
              placeholder="you@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={status === "sending"}
            className="min-h-[44px] w-full rounded-md bg-accent px-4 py-2 font-semibold text-black hover:bg-accentDark disabled:opacity-60"
          >
            {status === "sending" ? "Sending..." : "Send magic link"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      )}
    </div>
  );
}
