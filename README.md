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
| `ANTHROPIC_API_KEY` | Vercel + `.env.local` | Used by `/api/admin/upload` for slip vision extraction |
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
- `0005_manual_settlement.sql` — void reconciliation and ranking exclusions
- `0006_ranking_sort_order.sql` — worst-first ranking order
- `0007_add_cup_leagues.sql` — FA Cup and EFL Cup league values
- `0008_win_star.sql` — 90-minute-rule win tracking and ranking statistic
- `0009_odds_fraction.sql` — exact fractional-odds display value
- `0010_total_predicted_return_tiebreak.sql` — live total predicted-return
  aggregate and latest ranking order

Apply all of these via the Supabase SQL editor (in order) or the Supabase CLI.

### Current ranking order

The ranking sorts by betc\*nt count descending, wins ascending, win\* count
descending, Prediction Score ascending, total predicted return ascending, then
player name ascending. Chrimbo Cup position will be inserted immediately before
name when that competition launches.

Total predicted return is calculated live as the sum of `slip_return_amount` for
all bet rows assigned to a player. Uploads add to it immediately; correcting a
return replaces the contribution; reassigning a bet moves it between players; and
deleting a bet removes it. All statuses—including pending and voided bets—count.
There is currently no season boundary, so this remains an all-time total over bets
present in the database.

### Database rollback procedure

Database migrations that change application-facing objects have matching SQL
scripts under `supabase/rollbacks/`. To roll back safely:

1. Revert and deploy the application first, so live code no longer depends on
   the new database shape.
2. Run the matching rollback script in the Supabase SQL editor.
3. Verify the affected page against production data.

For migration `0010`, run
`supabase/rollbacks/0010_total_predicted_return_tiebreak.sql` only after the
ranking application change has been reverted.

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

## Uploading a slip (Phase 3, admin-only)

Players don't upload their own slips — they post the photo in the group's WhatsApp
chat, and the admin uploads it. `/admin/upload` (signed-in admin only, same as the
rest of `/admin/*`) — pick the player and bookmaker, take/choose a photo of the
slip. The server route (`src/app/api/admin/upload/route.ts`, also admin-only —
`middleware.ts` returns a 401 instead of a redirect for this one since it's called
via `fetch`, not a page navigation) stores the image in the private `betslips`
Storage bucket, calls Claude vision (`src/lib/extract-bet.ts`) to read the bet
date, stake, return, and the three legs, then inserts a `pending_review` bet. Any
leg that didn't parse cleanly (missing field, odds below 2.0, bad JSON) is left out
rather than guessed at, and noted in `admin_notes`. You're then sent to
`/admin/upload/confirm/[id]` to check/fix the extracted fields against the slip
image before it's done — full correction tooling for admin beyond settlement
fields comes in Phase 6.
