# Bet1865 — Build, Test & Deploy Plan

Companion to `SPECIFICATION.md`. This plan assumes that document is the single source
of truth that both the AI coding workflow and any human contributor conform to —
kept in the repo root as `SPEC.md` and referenced at the top of the project's
`CLAUDE.md`/`AGENTS.md` so every future coding session builds against it rather than
re-deriving requirements.

## Phase 0 — Project setup (½ day)

1. Create local folder `C:\Users\CJ\OneDrive\projects\bet1865`.
2. `npx create-next-app@latest` (TypeScript, App Router, Tailwind CSS, ESLint).
3. Init git, create private GitHub repo `bet1865`, push initial commit.
4. Create Supabase project; note project URL + anon/service keys.
5. Create Vercel project, link to the GitHub repo (auto-deploy `main` → production,
   PRs → preview URLs).
6. Set environment variables in Vercel (and a local `.env.local`, gitignored):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RAPIDAPI_KEY` (API-Football),
   `ADMIN_EMAIL`.
7. Copy `SPECIFICATION.md` into the repo as `SPEC.md`; add a short
   `CLAUDE.md`/`AGENTS.md` pointing every future coding session at it first.
8. Add `public/logo-betcnt.png` from the supplied logo image.

**Exit criteria**: empty Next.js app builds locally, deploys to a Vercel preview URL,
Supabase project reachable from the app.

## Phase 1 — Data layer (1 day)

1. Write the schema from §5 of the spec as Supabase SQL migrations
   (`supabase/migrations/`), including enums, tables, and the `player_rankings` view.
2. Seed `players` (the 6 fixed names) and a starter `bookmakers` list (Betfair —
   `is_betfair_exchange = true`, William Hill, Bet365, Sky Bet, Paddy Power…) via a
   seed script.
3. Set Row Level Security: public read on `players`, `bookmakers`, `bets`, `bet_legs`,
   `player_rankings`; writes restricted to the service role (server-side routes only)
   except the initial insert from Upload, which goes through a server action, never
   direct client writes.
4. Generate typed Supabase client (`supabase gen types typescript`).

**Exit criteria**: schema deployed to Supabase, seed data present, types generated,
`player_rankings` view returns all-zero rows for the 6 players.

## Phase 2 — Admin auth & shell (½–1 day)

1. Configure Supabase Auth for a single admin account.
2. Build auth middleware protecting `/admin/*`.
3. Build shared app shell/layout matching the branding in spec §7 (dark theme, yellow
   accent, header with betc\*nt logo, nav: Rules / Upload / Ranking / Admin) —
   **mobile-first per spec §6.2**: the nav collapses to a hamburger/menu icon below
   the `sm` breakpoint (dropdown or slide-in panel), and only expands to the
   inline logo-plus-links row at wider widths. Verify at a few common phone
   viewport widths (e.g. 375px, 414px), not just by shrinking a desktop window.

**Exit criteria**: `/admin` redirects to login when signed out; admin can sign in and
see an empty dashboard shell; the nav collapses to a hamburger below `sm` and expands
correctly above it.

## Phase 3 — Betslip upload & AI parsing (2–3 days)

1. Build `/upload`: player dropdown, bookmaker select/create, file input →
   Supabase Storage (private bucket). Per spec §6.2, the file input should allow
   picking directly from the phone's camera/gallery (`<input type="file"
   accept="image/*" capture>`), since a phone photo of the slip is the primary
   real-world path, not a desktop file browser.
2. Server route: on upload, call Claude vision API with the image + a structured
   extraction prompt (fields per §5's `bets`/`bet_legs` schema); parse/validate the
   JSON response with a schema library (e.g. Zod); on any validation failure or
   low-confidence field, still save what was extracted with `status =
   'pending_review'` and surface it to the uploader for a quick eyeball-confirm.
3. Insert `bets` + `bet_legs` rows; store the full raw AI response in
   `ai_raw_response` for audit/debugging.
4. Build the confirm screen (post-upload): show extracted fields next to the slip
   image, allow the uploader to correct obvious mistakes before final save.

**Exit criteria**: uploading a real (or realistic test) betslip screenshot produces a
correctly-populated `bets`/`bet_legs` pair with legs at odds ≥ 2.0, viewable in Admin.

## Phase 4 — Result lookup & settlement engine (2–3 days)

1. Build an API-Football client (server-side only, key never exposed to browser),
   with a `fixtures_cache` table to stay inside the free-tier rate limit.
2. Fixture matching: for each pending `bet_leg`, look up the fixture by team names +
   date/league; store `external_fixture_id` once matched (fuzzy-match team names
   against a small alias table, since bookmaker slips and API team-name spellings
   often differ — e.g. "Man City" vs "Manchester City").
3. For finished fixtures backing a Betfair-sourced leg, pull `/fixtures/events` and
   populate `fixture_goal_events`, tagging each goal `is_after_89_59` per §3.9 step 1.
4. Implement the §3.9 goal-event algorithm as a small pure function — given a
   fixture's goal-event list + predicted outcome, return `{score_at_90, score_at_ft,
   leg_result, settled_via_stoppage_flip, needs_review, notes}` — kept isolated from
   the API-fetching code so it can be unit-tested independently (see Phase 7).
5. Settlement logic implementing §3.7 for all legs: non-Betfair bookmakers settle
   directly off `score_at_ft`; Betfair-sourced legs run the §3.9 function above,
   with the data-quality guard (step 5) routing unresolvable legs to
   `pending_review` with `settlement_notes` explaining why, instead of guessing.
6. Roll up leg statuses into bet status/winnings per §3.7 (any loss ⇒ £0; clean
   sweep ⇒ slip's stated return).
7. Wire up a scheduled job (Vercel Cron → API route, e.g. a couple of times a day) to
   run settlement automatically. Note this needs no live/in-play tracking — it only
   has to check, after the fact, which pending legs' fixtures have finished, then
   pull each finished fixture's historical goal-event record once and run §3.9
   against it, so a low-frequency poll (rather than real-time monitoring during
   matches) is entirely sufficient. Also exposed as a manual "Run settlement now"
   button in Admin.

**Exit criteria**: a settled bet with known results correctly computes winnings and
leg-by-leg statuses, verified against 3–4 hand-picked historical fixtures, including
at least one real match with a genuine 90+N' goal to confirm the flip logic fires
correctly off real event data (not just synthetic test fixtures).

## Phase 5 — Ranking & Rules pages (1 day)

1. `/ranking`: leaderboard table sorted primary asc / secondary desc, per-player
   drill-down (bet history, streak, win rate), simple chart(s). Per spec §6.2, the
   table scrolls horizontally within its own container on narrow screens rather
   than forcing the whole page to scroll sideways.
2. `/rules`: render spec §3–4 content (store as structured content so admin can tweak
   wording without a code deploy, if desired — otherwise static MDX is fine for v1).

**Exit criteria**: ranking table matches the worked example in spec §4 when seeded
with equivalent test data, and remains fully usable (no page-level horizontal
scroll, table scrolls within its own container) at a 375px viewport width.

## Phase 6 — Admin correction tooling (1–2 days)

1. Bets list/detail view: slip image + AI extraction + editable fields side by side.
2. Manual override for any leg's predicted outcome, odds, scores, or status, and for
   the bet's status/winnings — every change writes to `admin_audit_log`.
3. Player/bookmaker management (add/deactivate).

**Exit criteria**: admin can fully correct a mis-parsed bet end-to-end and the
ranking recalculates immediately.

## Phase 7 — Testing

- **Unit tests** (Vitest/Jest): scoring logic (§4 worked example as fixtures); the
  §3.9 goal-event settlement function in isolation, covering — winning at 90 stays a
  win despite a later equaliser; losing at 90 flips to a win off a genuine 90+N'
  goal; losing at 90 with no after-89:59 event stays a loss; a first-half stoppage
  goal (45+N') correctly counts toward `score_at_90`, not treated as after-89:59; an
  inconsistent/incomplete events feed routes to `pending_review` rather than
  guessing; odds-validation (reject < 2.0).
- **Integration tests**: AI-parsing pipeline against a small fixed set of sample
  slip screenshots (Betfair, William Hill, Bet365 formats) with known expected
  output, run against a Supabase test project/schema.
- **E2E tests** (Playwright): upload → confirm → appears in Admin as
  `pending_review`; admin corrects and settles a bet → ranking updates correctly;
  auth gate on `/admin`.
- **Manual UAT**: each of the 6 players uploads one real slip during a trial week;
  CJ verifies settlement and ranking by hand against the actual results.

**Exit criteria**: CI (GitHub Actions) runs unit + integration tests on every PR;
Playwright E2E suite passes against a preview deployment before merge to `main`.

## Phase 8 — Deployment & operations

1. `main` branch auto-deploys to Vercel production on merge; PRs get preview URLs
   for review before merge (this is also where AI-generated code changes should be
   validated against `SPEC.md` before merging).
2. Supabase migrations applied via the Supabase CLI as part of the deploy step (or
   manually by CJ for v1, given single-admin operation).
3. Set up Vercel Cron for the settlement job; confirm it correctly settles a leg the
   morning after a real fixture finishes (no live/in-play behaviour to verify).
4. Basic monitoring: Vercel's built-in logs/analytics; alert (email) on settlement
   job failures.

**Exit criteria**: production URL live, first real week's bet flows through upload →
parse → settle → ranking without manual intervention beyond the initial admin
confirm.

## Phase 9 — Launch

1. Share the production URL with the 6 players; brief them on the Upload flow.
2. Run the first live week for real; CJ reviews Admin daily for the first couple of
   weeks to catch AI-parsing edge cases (new bookmaker formats, unusual slip layouts)
   and refine the extraction prompt/alias tables as needed.

## Estimated total effort

Roughly **10–14 working days** for a single developer (or equivalent AI-assisted
coding time), Phases 0–6 sequential, Phase 7 tests written alongside each phase
rather than saved to the end, Phase 8–9 typically another 1–2 days including the
first live trial week.

## Open decisions to pin down before Phase 0 starts

1. Exact Anthropic model to use for slip-vision extraction (cost/accuracy trade-off).
2. ~~Admin login method: Supabase email+password vs magic link.~~ Decided: magic
   link (Phase 2, complete).
3. Bookmaker seed list beyond Betfair (William Hill, Bet365, Sky Bet, Paddy Power,
   Ladbrokes, Coral, …) — confirm which ones the group actually uses.
4. Confirm API-Football (RapidAPI) plan/key is provisioned before Phase 4 starts,
   since the 100 req/day free-tier ceiling shapes the caching design.
