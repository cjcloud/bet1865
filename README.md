# Bet1865

Weekly treble-bet tracker and "betc\*nt" league table for a 6-player betting group.

See `SPEC.md` for the full project specification and `BUILD_TEST_DEPLOY_PLAN.md` for
the phased build/test/deploy plan. Agents/contributors: read `CLAUDE.md` first.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase/Anthropic/RapidAPI keys
npm run dev
```

## Environment variables

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | Config type in Vercel, not Secret (see note below) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + `.env.local` | Config type in Vercel, not Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + `.env.local` | Secret type is fine — server-only, never sent to the browser |
| `ANTHROPIC_API_KEY` | Vercel + `.env.local` | Used by `/api/upload` for slip vision extraction |
| `ANTHROPIC_MODEL` | Vercel + `.env.local` | **Must be set to a current vision-capable Claude model id** — not hardcoded in code on purpose, since model ids change over time. Upload will fail with a clear error if this is missing. |
| `API_FOOTBALL_KEY` | Vercel + `.env.local` | api-football.com's own direct dashboard key (not RapidAPI) — used by the confirm screen's fixture lookup (§3.12) and, from Phase 4, settlement |

**Vercel "Secret" vs "Config" env vars**: a Secret-type variable becomes write-only
after saving and can't later be converted to Config — if you ever can't verify a
variable's value in the Vercel UI, delete it and recreate as Config type rather than
fighting the greyed-out toggle.

## Database

Schema lives in `supabase/migrations/0001_init.sql`, seed data in
`supabase/seed.sql`. Then, in order:
- `0002_storage.sql` — private betslip storage bucket
- `0003_odds_flag.sql` — removes the DB-level odds >= 2.00 floor; adds the
  generated `below_minimum_odds` red-flag column (§3.10)
- `0004_fixture_lookup.sql` — `bet_leg_fixture_candidates` staging table for
  fixture-lookup disambiguation (§3.12)

Apply all of these via the Supabase SQL editor (in order) or the Supabase CLI.

## Admin auth (one-time setup)

The Admin area (`/admin/*`) uses Supabase magic-link sign-in, restricted to a single
pre-created admin user:

1. In Supabase: **Authentication → Users → Add user**, enter your admin email
   (auto-confirm it, no password needed).
2. In Supabase: **Authentication → Sign In / Providers** (or **Auth → Settings**,
   naming varies by dashboard version), turn **off** "Allow new user signups" — this
   ensures `signInWithOtp` only issues a magic link to the user you just created,
   not to anyone who types an email into the login form.
3. In Supabase: **Authentication → URL Configuration**, set **Site URL** to your
   production URL (e.g. `https://bet1865.vercel.app`) and add
   `https://bet1865.vercel.app/auth/callback` to **Redirect URLs** — otherwise magic
   links resolve against the default `localhost:3000` and fail for anyone testing
   against production.
4. Visit `/admin/login`, enter that email, and follow the link sent to your inbox.

Supabase's built-in auth email sender has a low hourly rate limit ("email rate limit
exceeded") — fine for solo admin use, but if you're testing repeatedly, consider
configuring a custom SMTP provider under **Authentication → Emails → SMTP Settings**
(e.g. Resend's free tier).

## Uploading a slip (Phase 3)

`/upload` — pick the player and bookmaker, take/choose a photo of the slip. The
server route (`src/app/api/upload/route.ts`) stores the image in the private
`betslips` Storage bucket, calls Claude vision (`src/lib/extract-bet.ts`) to read the
bet date, stake, return, and the three legs, then inserts a `pending_review` bet.
Any leg that didn't parse cleanly (missing field, odds below 2.0, bad JSON) is left
out rather than guessed at, and noted in `admin_notes`. You're then sent to
`/upload/confirm/[id]` to check/fix the extracted fields against the slip image
before it's done — full correction tooling for admin comes in Phase 6.
