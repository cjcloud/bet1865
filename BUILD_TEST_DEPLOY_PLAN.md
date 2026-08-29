# Bet1865 — Build, Test & Deploy Plan

Companion to `SPECIFICATION.md`. This plan assumes that document is the single source
of truth that both the AI coding workflow and any human contributor conform to —
kept in the repo root as `SPEC.md` and referenced at the top of the project's
`CLAUDE.md`/`AGENTS.md` so every future coding session builds against it rather than
re-deriving requirements.

## Handoff notes for a new chat session (read this first)

This project has been built interactively across several chat sessions with CJ, who
tests directly against the live Vercel production site (`https://bet1865.vercel.app`)
and reports back screenshots/errors to diagnose and fix. A new session picking this
up should know:

**Environment.** Local dev is at `C:\Users\CJ\Dev\bet1865` on CJ's Windows machine,
reached via the remote-devices bridge (`device_bash`, `device_stage_files`, etc. —
`~/mnt/Dev/bet1865` inside `device_bash`). CJ runs `git push` himself — the assistant
has no push credentials and should never attempt it; the assistant commits locally
and hands the push command to CJ.

**Verification workflow (important — don't skip).** `npm install` directly on the
network-mounted `~/mnt/Dev/bet1865` folder via `device_bash` is unreliable (ENOTEMPTY
errors, timeouts, corrupted installs). The reliable pattern, used throughout this
build: `tar` the source on-device (excluding `node_modules`, `.next`, `.git`,
`.env.local`) → `device_stage_files` into the cloud container (the tarball must first
be moved under `~/mnt/<connected-folder>/` — staging only works from inside a
connected folder, not from `/tmp`) → extract to `~/bet1865-verify` in the cloud
`Bash` tool → `npm install --no-audit --no-fund` (fast there, ~15-25s) →
`npx tsc --noEmit` → `npx next build` with dummy env vars (`ANTHROPIC_API_KEY=dummy
ANTHROPIC_MODEL=dummy NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy`) → only after a
clean pass, commit locally via `device_bash`. Delete of files inside the connected
folder (leftover tarballs, a stuck git lock file) needs
`device_request_delete_permission` first — `rm` is denied by default on that mount.
(`API_FOOTBALL_KEY` is no longer needed in this env var list — see "Resolved" below.)

**Known device_bash quirk.** Occasionally a prior interrupted `git` operation leaves
`.git/HEAD.lock` (or similar) behind, which blocks the next commit with "Unable to
create HEAD.lock: File exists" / "another git process seems to be running". This is
almost always a stale lock, not an actual concurrent process — request delete
permission for the Dev folder, remove the lock file, and retry the commit.

**Resolved (29 Aug 2026) — automated fixture lookup & settlement parked in favour
of manual entry.** The Phase 3 fixture-lookup feature (§3.12) worked technically
after three live-test fixes (leg_number not surviving a Server Action submit;
API-Football rejecting `search`+`country` together; `/fixtures` `from`/`to`
requiring `league`+`season`) plus a call-count fix, but was ultimately blocked by
API-Football's free plan excluding the current season entirely
(`"plan":"Free plans do not have access to this season..."`). A follow-up look at
scraping public results pages as a free alternative (worldfootball.net match
reports do carry the goal-minute detail the §3.9 settlement algorithm needed) found
the same kind of blocker one level down: those sites' terms of use prohibit
automated retrieval even for personal, non-commercial projects. **CJ decided to
park both approaches for v1** rather than pay for a data plan or accept the ToS
risk. The replacement, now the spec of record (SPEC.md §3.9a, §3.12a):
- The confirm screen's league + kick-off date/time fields are filled in by hand —
  no "Find fixture" API lookup.
- The admin registers a Won/Lost/Void result per leg directly in Admin once the
  match is known; the bet's overall status/winnings then derive automatically per
  §3.7 exactly as before.

**Clarified (29 Aug 2026) — how the admin determines a Betfair leg's result.**
The Betfair 90-minute rule (§3.8) applies **only** to Betfair Exchange legs, and
the admin does **not** work it out themselves from a scoreline. Betfair's own
website/app already settles each leg of the bet with that rule applied, so the
admin just reads the leg's settled Won/Lost status straight off Betfair and
transcribes it into Bet1865 — no goal-timeline reconstruction, no judgement call.
For every other bookmaker, the admin determines Won/Lost from the plain full-time
result (any source is fine, since no 90-minute nuance applies there). This means
the per-leg Won/Lost/Void control in Admin (Phase 4 below) never needs to expose
any 90-minute-specific UI — it's a plain three-way status picker regardless of
bookmaker; the *source* the admin checks just differs by bookmaker.

**Added (29 Aug 2026) — Void legs need an explicit reconciliation step, not just a
third status value.** A Void leg (postponed/abandoned/bookmaker-voided match)
breaks the plain any-loss/all-win roll-up, because a real bookmaker recalculates
the bet around a voided leg (e.g. a treble with one void leg becomes a double at
the remaining legs' odds) rather than just dropping it — a recalculation this app
doesn't attempt to reproduce. So whenever a bet has a Void leg, the automatic
roll-up (Phase 4 below) does **not** fire; the admin must explicitly resolve it via
a new **void reconciliation control** with two options (SPEC.md §3.7a): void the
whole bet (full stake refund, excluded entirely from scoring), or type in the
bookmaker's own recalculated return (stored as-is, bet settles `won`/`lost` off
whether that figure is nonzero, scores normally). See the rewritten Phase 4 below
and SPEC.md §4's scoring update (void-refunded bets don't count as bets played).

**Added (29 Aug 2026) — Admin needs to amend and delete existing bet slips.** Beyond
the settlement-specific corrections already covered (leg status, void
reconciliation, fixture date/time), the admin needs to edit **any** field on a bet
or its legs, and to **delete** a bet slip outright (duplicate upload, wrong player,
test entry). Deletion is destructive with no soft-delete in v1 — it requires a
confirm step and snapshots the full bet+legs as JSON into `admin_audit_log` before
removing the row, so there's a recovery path via manual re-entry even though there's
no in-app undo. **Decided (29 Aug 2026): a plain confirm dialog is sufficient
friction for v1** — no type-to-confirm or other extra step. See SPEC.md §6.3 and
the updated Phase 6 below.

No further API-Football or scraping work should be started for v1 — see Phase 3
and the new Phase 4 below for what actually needs building instead. `API_FOOTBALL_KEY`
can be removed from env vars/README once the dormant lookup code is removed or
feature-flagged off (Phase 3 task below).

**Git state at end of last session.** All fixture-lookup fixes are committed locally
on `main`; CJ pushes each commit himself after the assistant reports a clean
verification. If continuing this work, run `git log --oneline -10` via `device_bash`
first to see what's actually landed vs what's still local-only. The fixture-lookup
code (`src/lib/api-football.ts`, `lookupFixtureAction`/`chooseFixtureAction`,
migration `0004_fixture_lookup.sql`) is now **dormant/parked**, not deleted — see
Phase 3's task list below for what to do with it.

**Resolved (29 Aug 2026, session 2) — confirm-screen save bugs, dropdown contrast,
and the fixture-lookup UI fully removed.** A second same-day session fixed three
compounding bugs in the confirm-screen save flow, a UI contrast issue, and replaced
the parked fixture-lookup button:

- **Silent leg-save failures reported as "Saved".** `updateBetAction` validated
  each leg's fields but gave no feedback when a leg failed validation or failed to
  write, and always redirected to the read-only view claiming success. Fixed
  (b901138, 72839e2) by collecting a `legIssues` array with a specific message per
  problem leg, checking the `bet_legs.upsert()` call's own error return (previously
  ignored), and only redirecting to the read-only `/bets/[id]` view when all 3 legs
  actually saved — otherwise back to the confirm screen with a red issues banner.
- **Root cause of a bet that showed "No legs saved yet" despite having saved
  correctly in the database**: Next.js's server-side fetch Data Cache was serving a
  stale empty response indefinitely. `export const dynamic = "force-dynamic"` on a
  page does not reliably propagate `cache: "no-store"` into fetches made inside
  imported Supabase client modules. Fixed (4b0074a) by forcing `cache: "no-store"`
  via a custom `global.fetch` on both `createAdminClient()`
  (`src/lib/supabase-admin.ts`) and the server client (`src/lib/supabase-server.ts`).
  Confirmed fixed by independently re-checking a previously-broken bet afterward.
- **Low-contrast `<select>` dropdown popups on Windows Chrome/Edge** (light-grey
  background, hard-to-read text) — `color-scheme: dark` on `:root` didn't reliably
  reach the OS-level popup list. Fixed (ffd0a70) with explicit
  `select { color-scheme: dark; }` and `select option { background-color / color }`
  rules in `globals.css`.
- **Fixture-lookup UI fully replaced, not just hidden.** Per Phase 3 task 7's plan
  to disconnect the dead "Find fixture" button, CJ asked instead to repurpose it:
  the confirm screen's per-leg button is now **"Set to nearest Saturday, 3pm"**
  (975ae40), which fills that leg's kick-off date/time with a Saturday-3pm guess
  computed from the bet's own date (pure date arithmetic in the new
  `src/lib/nearest-saturday.ts` — same day if the bet date is itself a Saturday,
  otherwise the nearer of the previous/next Saturday) as a starting point the admin
  can hand-correct, rather than an automated lookup. `lookupFixtureAction`/
  `chooseFixtureAction` and the `bet_leg_fixture_candidates` query were removed
  from `actions.ts`/`page.tsx` entirely (not just hidden); `src/lib/api-football.ts`
  and migration `0004_fixture_lookup.sql` remain dormant in the repo per the
  existing plan, and `API_FOOTBALL_KEY` can now be dropped from env vars since
  nothing calls it — Phase 3 task 7 is effectively done, one step further than
  originally planned.
- **Follow-up fix**: the Saturday-suggestion button initially reset every other
  leg's unsaved edits back to the last-saved DB values each time it was clicked
  (each redirect only carried the one clicked leg's new value). Fixed (4d1a49e) by
  carrying the entire form's current field values through the redirect as a
  `formState` JSON blob, so clicking the button on leg 2 no longer discards a
  not-yet-saved edit already made to leg 1 or 3.

**Git state at end of this session.** `main` is at `4d1a49e`, pushed to
`origin/main` (`git status` clean, "up to date with origin/main"). Commit order
this session: b901138, 72839e2, 4b0074a, ffd0a70, 975ae40, 4d1a49e.

## Phase 0 — Project setup (½ day)

1. Create local folder `C:\Users\CJ\OneDrive\projects\bet1865`.
2. `npx create-next-app@latest` (TypeScript, App Router, Tailwind CSS, ESLint).
3. Init git, create private GitHub repo `bet1865`, push initial commit.
4. Create Supabase project; note project URL + anon/service keys.
5. Create Vercel project, link to the GitHub repo (auto-deploy `main` → production,
   PRs → preview URLs).
6. Set environment variables in Vercel (and a local `.env.local`, gitignored):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ADMIN_EMAIL`.
   (`API_FOOTBALL_KEY` was added during Phase 3's fixture-lookup work and is no
   longer needed now that feature is parked — see Handoff notes above.)
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
5. **New (v1.1)**: a migration dropping the now-unused fixture-lookup/automated-
   settlement columns and tables — `bet_legs.external_fixture_id`,
   `bet_legs.score_home_90`, `bet_legs.score_away_90`,
   `bet_legs.settled_via_stoppage_flip`, the `fixture_goal_events` table, and the
   `bet_leg_fixture_candidates` table — per SPEC.md §5's v1.1 changelog. If Phase 1
   is already complete on the live database, write this as a new forward migration
   rather than editing history.
6. **New (v1.3)**: add the `bet_reconciliation` enum
   (`'standard'|'voided_full_refund'|'manual_bookmaker_return'`) and
   `bets.reconciliation` column (default `'standard'`) per SPEC.md §5's v1.3
   changelog, and update the `player_rankings` view to exclude any bet with
   `reconciliation = 'voided_full_refund'` from both scores and the bets-played/
   win-rate denominator (SPEC.md §4).

**Exit criteria**: schema deployed to Supabase, seed data present, types generated,
`player_rankings` view returns all-zero rows for the 6 players.

## Phase 2 — Admin auth & shell (½–1 day)

1. Configure Supabase Auth for a single admin account.
2. Build auth middleware protecting `/admin/*`.
3. Build shared app shell/layout matching the branding in spec §7 (dark theme, yellow
   accent, header with betc*nt logo, nav: Rules / Upload / Ranking / Admin) —
   **mobile-first per spec §6.2**: the nav collapses to a hamburger/menu icon below
   the `sm` breakpoint (dropdown or slide-in panel), and only expands to the
   inline logo-plus-links row at wider widths. Verify at a few common phone
   viewport widths (e.g. 375px, 414px), not just by shrinking a desktop window.

**Exit criteria**: `/admin` redirects to login when signed out; admin can sign in and
see an empty dashboard shell; the nav collapses to a hamburger below `sm` and expands
correctly above it.

## Phase 3 — Betslip upload & AI parsing (2–3 days) — code complete, pending live test

1. ~~Build `/upload`: player dropdown, bookmaker select/create, file input →
   Supabase Storage (private bucket)~~ Done — `src/app/upload/page.tsx` +
   `UploadForm.tsx`, with `capture="environment"` on the file input per §6.2.
2. ~~Server route: on upload, call Claude vision API...~~ Done —
   `src/app/api/upload/route.ts` + `src/lib/extract-bet.ts` +
   `src/lib/bet-schema.ts`. Uses a loose Zod schema (every field optional) since
   real OCR is imperfect; only legs with every field present and odds > 0 are
   inserted into `bet_legs` (no lower floor — see §3.10), everything else is left
   out and noted in `admin_notes` rather than guessed at or silently dropped.
3. ~~Insert `bets` + `bet_legs` rows; store the full raw AI response~~ Done —
   `ai_raw_response` stores `{ raw, parsed, extraction_error }`.
4. ~~Build the confirm screen (post-upload)~~ Done —
   `src/app/upload/confirm/[id]/page.tsx` + `actions.ts`, a server action form,
   slip image via a signed URL next to editable bet + 3-leg fields (league,
   kick-off date/time typed by hand per §3.12a).
5. New: private `betslips` Storage bucket via
   `supabase/migrations/0002_storage.sql` (run this in the Supabase SQL editor
   alongside 0001 — service-role-only policy, no client-side Storage access).
6. New required env vars: `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (the latter
   is deliberately not hardcoded — set it to a current vision-capable Claude
   model id; see README.md's env var table and open decision #1 below).
7. **Done (v1.2, 29 Aug 2026 session 2) — parked fixture-lookup UI replaced, not
   just hidden.** The "Find fixture" button and its `lookupFixtureAction`/
   `chooseFixtureAction` calls were removed entirely from `actions.ts`/`page.tsx`
   and replaced with a "Set to nearest Saturday, 3pm" heuristic button — see the
   session-2 Resolved note below for details. `src/lib/api-football.ts` and
   migration `0004_fixture_lookup.sql` remain dormant in the repo (simplest,
   reversible if a paid data source is adopted later). `API_FOOTBALL_KEY` can now
   be dropped from env vars — nothing calls it.

**Exit criteria**: uploading a real (or realistic test) betslip screenshot produces a
correctly-populated `bets`/`bet_legs` pair, viewable in Admin, with league and
kick-off entered manually. Legs priced below the 2.0 evens minimum are recorded and
red-flagged (`below_minimum_odds`), never rejected or silently dropped — see
SPEC.md §3.10.

**Live-tested against the deployed app** (28 Aug 2026) and fixed along the way:
- An "identity-linked" Anthropic API key needs an `anthropic-workspace-id` header —
  `ANTHROPIC_WORKSPACE_ID` env var added, see README.md.
- A leg missing just one field (e.g. kick-off time not legible on the slip) was
  discarded entirely instead of saving what *did* parse — confirm screen now
  pre-fills from the raw AI extraction as a fallback so only the true gap needs
  filling in by hand.
- The extraction prompt mis-converted fractional odds (e.g. read "11/10" as `1.10`
  instead of correctly converting to `2.10`) — prompt fixed with the conversion
  formula and worked examples (SPEC.md §3.11); DB's old `odds >= 2.00` floor also
  removed (migration `0003_odds_flag.sql`) per the §3.10 red-flag-don't-reject
  change above.
- Debug view added to the confirm screen showing Claude's raw extraction JSON —
  remove before real launch.

**Fixture lookup (pulled forward from Phase 4, 29 Aug 2026) — built, live-tested,
then parked, then replaced (see session-2 Resolved note below):**
- `src/lib/api-football.ts` + `lookupFixtureAction`/`chooseFixtureAction` in
  `actions.ts` searched api-football.com for a real fixture and let the
  uploader/admin confirm it to auto-fill league/kick-off/`external_fixture_id`.
  Four issues were found and fixed on live test (a Server Action FormData quirk
  losing `leg_number`; API-Football rejecting `search`+`country` together;
  `/fixtures` `from`/`to` requiring `league`+`season`; a rate-limit fix hardcoding
  the six English competitions' league IDs: PL=39, Championship=40, League One=41,
  League Two=42, FA Cup=45, EFL Cup=48) before a fifth issue — the free-plan
  current-season restriction — turned out to be a commercial blocker, not a bug.
  This feature was parked in favour of manual entry (§3.12a), and in session 2 its
  UI entry point was replaced outright with the Saturday-suggestion button (see
  below) rather than merely hidden.
- **View Slips** (`/bets`, `/bets/[id]`) — pulled forward from Phase 5's spirit
  (browsing what's been recorded) since the user wanted it as the landing
  page right after a successful upload, with an "Upload a Bet Slip" button —
  see SPEC.md §6.1. Not the full Ranking page (still Phase 5); just a
  browse-by-player list and a read-only per-slip view. Live-tested, working.
  **Unaffected by the parking decision** — keep as-is.
- Migration `0004_fixture_lookup.sql` (`bet_leg_fixture_candidates`) — now
  dropped per Phase 1 task 5 above.

## Phase 4 — Manual settlement (was: automated result lookup & settlement engine) (1–2 days)

Automated result settlement via API-Football (and a scraping-based alternative) is
parked per the Handoff notes above and SPEC.md §3.9/§3.9a. This phase is rewritten
around the admin manually registering each leg's result, plus a required
reconciliation path for Void legs (SPEC.md §3.7a):

1. In Admin's bet detail view, add a **Won / Lost / Void control per leg**
   (three tap-sized buttons or a segmented control — not a cramped dropdown, per
   spec §6.2's mobile requirement) plus the optional `settlement_notes` free-text
   field and optional `score_home_ft`/`score_away_ft` fields (§5). This is a plain
   three-way status picker regardless of bookmaker — there's no separate
   "90-minute" UI to build (see the Handoff notes' Clarified section above): for a
   Betfair-sourced leg the admin is expected to check the Betfair site/app first
   (§3.8, §3.9a) and then just pick the status it shows; for any other bookmaker
   they pick it from the full-time result. A short helper caption next to the
   control for Betfair-sourced legs ("Betfair applies its own 90-minute rule —
   enter the status as settled on Betfair") is a nice-to-have reminder, not a
   functional requirement.
2. On saving a leg's status, **derive the bet's overall status/winnings
   automatically** per §3.7, **but only when no leg on the bet is Void**: any leg
   `lost` ⇒ bet `lost`, `winnings = 0`; all three legs `won` ⇒ bet `won`,
   `winnings = slip_return_amount`; any leg still `pending` ⇒ bet stays
   `pending_settlement`. This recompute should run as a small pure function
   (bet-legs-in, bet-status/winnings-out) kept isolated from the UI code so it's
   unit-testable (see Phase 7) — this replaces the old §3.9 goal-event function as
   the thing Phase 7's settlement unit tests exercise.
3. **New — Void-leg reconciliation control (SPEC.md §3.7a).** As soon as *any* leg
   on a bet is set to Void, step 2's roll-up must not fire (the bet stays
   `pending_settlement` regardless of the other two legs' statuses) and the bet
   detail view instead shows a reconciliation control with two mutually-exclusive
   actions:
   - **"Void the whole bet"** — sets `bets.status = 'void'`,
     `bets.reconciliation = 'voided_full_refund'`, `bets.winnings = stake`.
   - **"Enter bookmaker's return"** — a numeric input for the actual payout the
     bookmaker gave; on save, sets `bets.reconciliation = 'manual_bookmaker_return'`,
     `bets.winnings` = that entered amount, and `bets.status = 'won'` if the amount
     is greater than 0, else `'lost'`.
   Either action is available from the same control (e.g. a radio choice between
   the two paths, or two clearly-labelled buttons), and either can be re-opened
   and changed later — re-choosing overwrites the previous reconciliation and
   updates `bets.status`/`winnings`/`reconciliation` accordingly. Un-voiding a leg
   (correcting a mistaken Void back to Won/Lost) should also clear
   `bets.reconciliation` back to `'standard'` and let step 2's normal roll-up
   take over again once all three legs are Won/Lost.
4. Every leg status change and every §3.7a reconciliation choice (including a
   correction to either) writes to `admin_audit_log` and immediately re-runs the
   relevant roll-up (step 2 or step 3) — no stale derived state, no separate "run
   settlement" trigger needed.
5. No scheduled job, no external API call, no `fixtures_cache` table — settlement
   is entirely admin-driven and synchronous with the leg-status edit.

**Exit criteria**: in Admin, marking all three legs of a bet Won/Lost correctly
computes the bet's status and winnings immediately per §3.7's rules, verified
against the §4 worked example (a 3/3 win, a 2/3 loss, a 0/3 loss, another 3/3 win);
additionally, marking one leg of a bet Void surfaces the reconciliation control and
suppresses the automatic roll-up until the admin chooses "void the whole bet" (bet
becomes `void`, winnings = stake, excluded from the Ranking page's scores and bets-
played count) or "enter bookmaker's return" (bet becomes `won`/`lost` per the
entered figure and scores normally) — both paths verified against a seeded test
bet. The Ranking page (Phase 5) reflects all of the above without any manual
recalculation step.

## Phase 5 — Ranking & Rules pages (1 day)

1. `/ranking`: leaderboard table sorted primary asc / secondary desc, per-player
   drill-down (bet history, streak, win rate), simple chart(s). Per spec §6.2, the
   table scrolls horizontally within its own container on narrow screens rather
   than forcing the whole page to scroll sideways. Per SPEC.md §4, bets with
   `reconciliation = 'voided_full_refund'` are excluded from both scores and from
   the bets-played/win-rate denominator.
2. `/rules`: render spec §3–4 content (store as structured content so admin can tweak
   wording without a code deploy, if desired — otherwise static MDX is fine for v1).

**Exit criteria**: ranking table matches the worked example in spec §4 when seeded
with equivalent test data, and remains fully usable (no page-level horizontal
scroll, table scrolls within its own container) at a 375px viewport width. A
seeded fully-voided bet does not appear in any player's bets-played count or
scores; a seeded bet reconciled via the manual-bookmaker-return path does.

## Phase 6 — Admin correction tooling (1–2 days)

1. Bets list/detail view: slip image + AI extraction + editable fields side by side.
2. **Amend**: manual override for any bet-level field (player, bookmaker, bet date,
   stake, slip return amount, admin notes) and any leg field (predicted outcome,
   odds, league, kick-off date/time, status, settlement notes, full-time score) —
   see SPEC.md §6.3. Every change writes to `admin_audit_log`, and any downstream
   derived state (bet status/winnings, rankings) recomputes immediately, same as
   after a settlement change (Phase 4).
3. **Delete** (SPEC.md §6.3): a destructive action on the bet detail view, gated by
   a **plain confirm dialog** (decided 29 Aug 2026 — no type-to-confirm or other
   extra friction needed for v1). On confirm:
   - Snapshot the full bet row + its `bet_legs` rows as JSON and write it to
     `admin_audit_log` (`entity_type='bet'`, `field_changed='deleted'`,
     `old_value` = the JSON snapshot, `new_value=null`) *before* deleting anything.
   - Delete the `bets` row (`bet_legs` cascade automatically per §5's schema).
   - Best-effort delete the slip's image from Supabase Storage (log a warning and
     continue if this step fails — it shouldn't block the row deletion).
   - Redirect back to the bets list; confirm the bet no longer appears in View
     Slips, Admin, or the Ranking page's totals.
4. Player/bookmaker management (add/deactivate).

**Exit criteria**: admin can fully correct a mis-parsed bet end-to-end (including
registering/correcting a leg's result and, where needed, a void reconciliation,
per Phase 4) and the ranking recalculates immediately. Amending any bet-level or
leg-level field persists correctly and is reflected in View Slips/Ranking without a
page reload doing anything special. Deleting a seeded test bet (after confirming
the plain confirm dialog) removes it (and its legs and slip image) completely,
leaves a recoverable JSON snapshot in `admin_audit_log`, and the Ranking page's
totals drop accordingly with no manual recompute needed.

## Phase 7 — Testing

- **Unit tests** (Vitest/Jest): scoring logic (§4 worked example as fixtures); the
  Phase 4 bet-level roll-up function in isolation — any single leg `lost` ⇒ bet
  `lost`/£0 regardless of the other two legs; all three legs `won` ⇒ bet `won`/slip
  return; any leg still `pending` ⇒ bet stays `pending_settlement`; re-registering
  a leg's result recomputes the bet correctly (idempotency); odds-flagging
  (`below_minimum_odds` true for anything under 2.0, never blocks saving — §3.10).
  Note the roll-up function itself is bookmaker-agnostic (it only ever sees a
  leg's final Won/Lost/Void status, per the Handoff notes' Clarified section) —
  there is no Betfair-specific branch to unit test here; that logic lives entirely
  outside the app, on Betfair's own site.
  **New (v1.3)**: unit tests for the §3.7a void-reconciliation function — any Void
  leg present suppresses the normal roll-up regardless of the other two legs'
  statuses; "void the whole bet" produces `status='void'`, `winnings=stake`,
  `reconciliation='voided_full_refund'`; "enter bookmaker's return" with a nonzero
  amount produces `status='won'` with that exact `winnings` figure and
  `reconciliation='manual_bookmaker_return'`, and with a zero amount produces
  `status='lost'`; un-voiding a leg back to Won/Lost resets `reconciliation` to
  `'standard'` and lets the normal roll-up take over once all three legs are
  Won/Lost.
  **New (v1.4)**: unit test for the delete function — deleting a bet writes a
  correct JSON snapshot of the bet+legs to `admin_audit_log` before removing the
  row, and the row (plus its legs) is actually gone afterwards.
  **New (v1.5, session 2)**: unit test for `nearestSaturdayAt3pm` — covers a full
  week of input dates and asserts Saturday→same day, Sunday/Monday/Tuesday→previous
  Saturday, Wednesday/Thursday/Friday→next Saturday, always at `T15:00`.
- **Integration tests**: AI-parsing pipeline against a small fixed set of sample
  slip screenshots (Betfair, William Hill, Bet365 formats) with known expected
  output, run against a Supabase test project/schema.
- **E2E tests** (Playwright): upload → confirm (manual league/kick-off entry) →
  appears in Admin as `pending_review`; admin registers all three legs'
  Won/Lost/Void and the bet settles correctly → ranking updates correctly;
  a bet with a Void leg surfaces the reconciliation control and both of its
  paths work end-to-end, including the Ranking page correctly excluding a
  fully-voided bet; admin amends a bet-level field (e.g. player) and a leg field
  (e.g. odds) and both persist and recompute correctly; admin deletes a bet
  through the plain-confirm-dialog flow and it disappears from View
  Slips/Admin/Ranking; auth gate on `/admin`; clicking "Set to nearest Saturday,
  3pm" on leg 2 after already editing leg 1's fields preserves leg 1's edits
  through the redirect.
- **Manual UAT**: each of the 6 players uploads one real slip during a trial week;
  CJ registers each leg's result by hand (checking Betfair's site directly for any
  Betfair-sourced leg) and verifies settlement and ranking against the actual
  results, including exercising the void-reconciliation flow if any real match is
  postponed or abandoned during the trial, and exercising amend/delete on at least
  one mistaken or duplicate real upload.

**Exit criteria**: CI (GitHub Actions) runs unit + integration tests on every PR;
Playwright E2E suite passes against a preview deployment before merge to `main`.

## Phase 8 — Deployment & operations

1. `main` branch auto-deploys to Vercel production on merge; PRs get preview URLs
   for review before merge (this is also where AI-generated code changes should be
   validated against `SPEC.md` before merging).
2. Supabase migrations applied via the Supabase CLI as part of the deploy step (or
   manually by CJ for v1, given single-admin operation).
3. Basic monitoring: Vercel's built-in logs/analytics.

**Exit criteria**: production URL live, first real week's bet flows through upload →
parse → admin confirm (manual league/kick-off) → admin registers leg results →
ranking, without needing any external data lookups.

## Phase 9 — Launch

1. Share the production URL with the 6 players; brief them on the Upload flow.
2. Run the first live week for real; CJ reviews Admin daily for the first couple of
   weeks to catch AI-parsing edge cases (new bookmaker formats, unusual slip layouts)
   and refine the extraction prompt/alias tables as needed.

## Estimated total effort

Roughly **9–13 working days** for a single developer (or equivalent AI-assisted
coding time) — a day or so less than the original estimate now that Phase 4 is a
simple admin UI + roll-up function rather than an external-API settlement engine
(the void-reconciliation and amend/delete additions add back a small amount of
that saved time). Phases 0–6 sequential, Phase 7 tests written alongside each
phase rather than saved to the end, Phase 8–9 typically another 1–2 days including
the first live trial week.

## Open decisions to pin down before Phase 0 starts

1. Exact Anthropic model to use for slip-vision extraction (cost/accuracy trade-off).
2. ~~Admin login method: Supabase email+password vs magic link.~~ Decided: magic
   link (Phase 2, complete).
3. Bookmaker seed list beyond Betfair (William Hill, Bet365, Sky Bet, Paddy Power,
   Ladbrokes, Coral, …) — confirm which ones the group actually uses.
4. ~~Confirm API-Football (RapidAPI) plan/key is provisioned before Phase 4
   starts~~ **Resolved/parked (29 Aug 2026)**: API-Football's free plan excludes
   current-season data, and a scraping-based fallback ran into terms-of-service
   restrictions on automated retrieval — see the Handoff notes at the top of this
   document. CJ decided to park both automated fixture lookup and automated
   settlement for v1 and go fully manual instead (SPEC.md §3.9a, §3.12a; Phase 3
   task 7 and the rewritten Phase 4 above), with Betfair-sourced legs settled by
   transcribing Betfair's own site (§3.8) rather than any in-app judgement call,
   and Void legs requiring the explicit §3.7a reconciliation rather than any
   automatic handling. No further action needed unless a paid data source is
   adopted later.
5. ~~Whether bet deletion should require anything stronger than a confirm
   dialog~~ **Decided (29 Aug 2026)**: a plain confirm dialog is sufficient for
   v1 — no type-to-confirm or other extra friction (SPEC.md §6.3, Phase 6 above).
