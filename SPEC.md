# Bet1865 — Project Specification

Version 1.0 — 28 August 2026
Owner / Admin: CJ

## 1. Purpose

Bet1865 tracks a recurring social betting game played by six friends. Each week one
player places a £10 treble (3-leg accumulator) across the top four English football
divisions, uploads a screenshot of the bet slip, and the app extracts the bet details,
looks up the real match results, settles the bet, and updates a running leaderboard —
the **"betc\*nt" ranking** — that scores players on both outcomes (won/lost the bet) and
performance (how many legs came in).

## 2. Players

Six named players, fixed list, managed by admin:

`John, Clive, Dingle, Chris, Simon, Moony`

Players do not log in (see §6.2). They are simply the "owner" field on a bet record,
selected from a dropdown when a bet is uploaded.

## 3. The Game — Canonical Rules

These rules are the source of truth for the in-app **Rules** page and for all scoring
logic. Any change to this section must be mirrored on that page.

1. Each week, one of the six players places a **treble** (3-leg accumulator) bet.
2. All three legs must be football matches from the **English top-flight domestic
   pyramid**: Premier League, EFL Championship, EFL League One, EFL League Two.
3. Each leg must be priced at **Evens (decimal 2.0) or better** (i.e. odds ≥ 2.0) at
   the time the bet is placed.
4. Stake is fixed at **£10** per bet.
5. Once placed, the player uploads a screenshot of the bet slip to the app.
6. The app extracts and stores: bet date, each leg's home/away teams, the predicted
   outcome per leg, the odds per leg, the total stake, the potential return shown on
   the slip, the bet owner, and the bookmaker.
7. **Settlement**: the bet is reconciled automatically against real results.
   - If **any of the three legs loses**, the whole bet loses and **winnings = £0**,
     regardless of what the slip's stated return was.
   - If **all three legs win**, **winnings = the return amount printed on the bet
     slip** (not recalculated from odds — the slip figure is authoritative, to account
     for bookmaker-specific rounding, boosts, etc.).
8. **Betfair Exchange special case**: Betfair Exchange settles in-play bets on the
   match state at the 90-minute mark (end of normal time), with one asymmetric
   exception:
   - If a leg is **winning at the 90-minute mark**, it is settled as a **win**, even
     if the scoreline changes again before the final whistle (i.e. an equaliser or
     late goal in stoppage time does **not** undo an already-winning leg).
   - If a leg is **losing at the 90-minute mark** but the scoreline changes before
     the final whistle such that the leg **would then be winning**, that leg **is**
     settled as a win.
   - In short: `leg_result = WIN if (winning_at_90min OR winning_at_fulltime)`, for
     Betfair-sourced legs only. Non-Betfair bookmakers settle on the conventional
     full-time result only.

### 3.9 Precise algorithm for the 90-minute cut-off (goal-event driven)

"The state at 90 minutes" is not a field any results API hands over directly — it has
to be derived by walking the match's **goal event timeline** and asking, for each
goal, whether it happened at or before the 89:59 mark or after it. The rule as you've
specified it: **any goal event timestamped after 89:59 (i.e. in second-half stoppage
time, commonly shown as "90+N'") is the only thing that can flip a losing leg into a
winning one; it can never undo an already-winning leg.**

Critically, this requires **no live/in-play polling at all** — it is worked out
purely from the finished match's historical goal-by-goal record, fetched once after
the final whistle. The settlement job never needs to know what the score was "at the
time" during the match; it reconstructs the 90-minute state after the fact from the
full list of goals and their minute-stamps. Two worked examples, straight from the
timeline:

- Predicted outcome **DRAW**. Goals before 89:59 leave it 1–1 (a draw — matches the
  prediction already). A further goal at 92' makes the final score 2–1. Because the
  leg was **already winning at the 90-minute state**, it stays a **win** — the later
  goal is irrelevant (§3.9 step 4, first branch).
- Predicted outcome **DRAW**. Goals before 89:59 have the home side 2–0 up (not a
  draw — losing at 90). The away side pulls one back at 92', final score 2–1. The
  90-minute state was never a draw, and neither is the full-time state — the
  after-89:59 goal moved the score but never reached the predicted outcome, so the
  leg is a **loss**, both before and after 90 minutes (§3.9 step 4, "otherwise"
  branch — the flip condition requires the *full-time* result to match the
  prediction, which it doesn't here).

**Inputs** (per fixture, per leg): the ordered list of goal events from API-Football's
fixture events endpoint, each with `team` (scorer's side), `time.elapsed` (minute,
1–90+) and `time.extra` (added minutes, present only during stoppage periods),
plus which side is nominally "home"/"away" for that fixture.

**Step 1 — classify every goal event as normal-time or stoppage-after-90:**
- A goal is **normal-time** (counts toward the 90-minute state) if `time.extra` is
  null/0 — this covers every goal scored during the run of play in both halves,
  including first-half stoppage (e.g. "45+2'"), because first-half stoppage happens
  well before the 90-minute mark.
- A goal is **after-89:59** (only relevant to the flip-to-win case) if
  `time.elapsed == 90` **and** `time.extra > 0` (i.e. it is shown as "90+1'",
  "90+2'", etc. — genuine second-half stoppage time). Extra-time periods (which don't
  apply to normal league fixtures, only some cup replays) would also count as
  after-89:59 if ever encountered.

**Step 2 — compute two scorelines:**
- `score_at_90` = tally of all **normal-time** goals only.
- `score_at_ft` = tally of **all** goals (normal-time + after-89:59), i.e. the
  actual final score.

**Step 3 — resolve each state to WIN/LOSE/DRAW relative to the leg's
`predicted_outcome`** (HOME_WIN / AWAY_WIN / DRAW), independently for `score_at_90`
and `score_at_ft`.

**Step 4 — apply the asymmetric rule:**
```
leg_result =
  WIN   if result(score_at_90) == predicted_outcome
  WIN   if result(score_at_90) != predicted_outcome
          AND result(score_at_ft) == predicted_outcome
          AND at least one goal event is classified after-89:59
  LOSE  otherwise
```
The explicit "at least one after-89:59 goal event" guard matters: if `score_at_90`
and `score_at_ft` simply differ because of a data error (not a real stoppage-time
goal), the algorithm should not silently flip the result — it should instead fall
into the "otherwise" branch, which for non-matching states with **no** qualifying
event means something is inconsistent, and the leg should be flagged
`pending_review` for admin rather than guessed at (see Step 5).

**Step 5 — data-quality guard:** if `score_at_90` and `score_at_ft` disagree on the
predicted outcome but **no** goal event is flagged after-89:59 to explain the
discrepancy (e.g. the events feed is incomplete, or a goal's `time.extra` is
missing/mis-tagged), do **not** auto-settle that leg — set it to `pending_review`
with both computed scorelines and the raw event list attached, for admin to resolve
by hand from another source (BBC Sport minute-by-minute, the bookmaker's own
settled-bet record, etc.).

Only Betfair-sourced legs (`bookmakers.is_betfair_exchange = true`) run this
algorithm. For every other bookmaker, only `score_at_ft` matters and the goal-event
walk is unnecessary — `result(score_at_ft) == predicted_outcome` settles the leg
directly.

## 4. Scoring — "betc\*nt" Ranking

Every player starts each season at **0 / 0**. Two scores are tracked per player:

**Primary betc\*nt score** (lower is better; this is the main sort key)
- +1 every time a bet **recorded for that player** ultimately **loses** (i.e. at
  least one leg loses).
- Unaffected by wins.

**Secondary betc\*nt score** (used as tiebreaker / form indicator)
- +1 for **every individual leg that wins**, across all of that player's bets
  (0–3 per bet).
- +2 **bonus** on any bet where **all three legs win** (in addition to the +3
  already earned from the three individual leg wins above), i.e. a clean-sweep bet
  contributes +5 to the secondary score in total.

The ranking table sorts primary ascending (fewest "betc\*nt" moments first), then
secondary descending as the tiebreaker. Both scores, plus bets played, win rate, and
current streak, are shown per player.

### Worked example

| Bet | Legs won | Bet result | Primary Δ | Secondary Δ |
|---|---|---|---|---|
| 1 | 3/3 | Won | +0 | +3 (legs) +2 (bonus) = +5 |
| 2 | 2/3 | Lost | +1 | +2 |
| 3 | 0/3 | Lost | +1 | +0 |
| 4 | 3/3 | Won | +0 | +5 |

Totals after 4 bets: primary = 2, secondary = 12.

## 5. Data Model (Supabase / Postgres)

```sql
-- Fixed roster; seeded once, editable by admin
create table players (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,       -- John, Clive, Dingle, Chris, Simon, Moony
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table bookmakers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,       -- Betfair, William Hill, Bet365, ...
  is_betfair_exchange boolean not null default false, -- drives the 90-min rule
  created_at    timestamptz not null default now()
);

create type bet_status as enum ('pending_review','pending_settlement','won','lost','void');
create type leg_status as enum ('pending','won','lost','void');
create type league_code as enum ('PL','CHAMPIONSHIP','LEAGUE_ONE','LEAGUE_TWO');
create type predicted_outcome as enum ('HOME_WIN','AWAY_WIN','DRAW');

create table bets (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references players(id),
  bookmaker_id        uuid not null references bookmakers(id),
  bet_date            date not null,
  slip_image_path     text not null,        -- Supabase Storage object path
  stake               numeric(10,2) not null default 10.00,
  slip_return_amount  numeric(10,2) not null, -- "winnings if successful", from slip
  status              bet_status not null default 'pending_review',
  winnings            numeric(10,2),         -- computed on settlement: 0 or slip_return_amount
  parsed_by_ai        boolean not null default true,
  ai_raw_response     jsonb,                 -- full Claude vision extraction, for audit
  admin_verified      boolean not null default false,
  admin_notes         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table bet_legs (
  id                  uuid primary key default gen_random_uuid(),
  bet_id              uuid not null references bets(id) on delete cascade,
  leg_number          smallint not null check (leg_number between 1 and 3),
  league              league_code not null,
  home_team           text not null,
  away_team           text not null,
  match_datetime      timestamptz not null,
  predicted_outcome   predicted_outcome not null,
  odds                numeric(6,2) not null check (odds >= 2.00),
  external_fixture_id text,                  -- API-Football fixture id, once matched
  status              leg_status not null default 'pending',
  score_home_90       smallint,              -- derived: tally of normal-time goals only (§3.9 step 2)
  score_away_90       smallint,
  score_home_ft       smallint,              -- derived: final full-time score, all goals
  score_away_ft       smallint,
  settled_via_stoppage_flip boolean not null default false, -- true if §3.9 step 4's flip case fired
  settlement_notes    text,                  -- e.g. why a leg was sent to pending_review (§3.9 step 5)
  settled_at          timestamptz,
  admin_override      boolean not null default false,
  unique (bet_id, leg_number)
);

-- Raw goal-event timeline per fixture, fetched once from API-Football and cached
-- (keeps us inside the free-tier rate limit and gives an auditable record of exactly
-- which events the 90-minute algorithm in §3.9 was run against).
create table fixture_goal_events (
  id                  uuid primary key default gen_random_uuid(),
  external_fixture_id text not null,
  scoring_team        text not null,        -- 'home' | 'away'
  is_own_goal         boolean not null default false,
  minute_elapsed      smallint not null,     -- time.elapsed from the API, 1-90+
  minute_extra        smallint,              -- time.extra from the API, null unless in stoppage
  is_after_89_59      boolean not null,      -- computed at ingest per §3.9 step 1
  fetched_at          timestamptz not null default now(),
  unique (external_fixture_id, minute_elapsed, minute_extra, scoring_team, is_own_goal)
);

-- append-only audit log for admin corrections
create table admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,   -- 'bet' | 'bet_leg'
  entity_id     uuid not null,
  field_changed text not null,
  old_value     text,
  new_value     text,
  changed_by    text not null default 'admin',
  changed_at    timestamptz not null default now()
);
```

A `player_rankings` view (or nightly materialized view) derives the primary/secondary
scores from `bets`/`bet_legs` per §4, so scores are never stored redundantly — they're
always recomputed from settled data.

## 6. Application Architecture

- **Framework**: Next.js (App Router, TypeScript), deployed on **Vercel**.
- **Database & storage**: **Supabase** (Postgres + Storage for slip images +
  scheduled Edge Functions / pg_cron for the settlement job).
- **Source control / CI-CD**: local dev in `C:\Users\CJ\OneDrive\projects\bet1865`,
  pushed to **GitHub**, with Vercel's GitHub integration auto-deploying `main` to
  production and PRs to preview environments.
- **Slip parsing**: uploaded image → Anthropic **Claude vision API call** (server-side,
  using an Anthropic API key stored as a Vercel/Supabase secret) → structured JSON
  matching the `bets`/`bet_legs` schema → inserted as `pending_review` for admin to
  confirm (or auto-confirm if confidence is high — configurable).
- **Result lookup / settlement**: a scheduled job (Vercel Cron hitting an API route, or
  a Supabase scheduled Edge Function) queries **API-Football (RapidAPI)** for fixtures
  across the four divisions, matches them to `bet_legs` by team names + date, pulls
  each fixture's **goal-event timeline** (the `/fixtures/events` endpoint) into
  `fixture_goal_events`, and runs the deterministic algorithm in §3.9 to resolve each
  Betfair leg's `score_home_90`/`score_away_90` vs `score_home_ft`/`score_away_ft` and
  decide win/lose — including the after-89:59 flip case. Given free-tier rate limits
  (~100 req/day), the job batches lookups (one events call per fixture, cached
  indefinitely once the match has finished) rather than re-polling. Where the events
  feed is incomplete or inconsistent, §3.9 step 5's data-quality guard routes that leg
  to `pending_review` rather than guessing, with **admin override always available**
  (see §6.4) to resolve it by hand.
- **Auth**: **admin-only** authentication via Supabase Auth (single admin account,
  email+password or magic link — CJ's choice at build time). Players are plain data
  rows with no login; the public-facing pages (Upload, Ranking, Rules) are accessible
  without auth, gated only by it being a private/unlisted deployment. The Admin page
  is the only route behind auth middleware.

### 6.1 Pages

1. **Rules** (`/rules`) — renders §3 and §4 of this document (kept as structured
   content, e.g. MDX or a CMS-style table in the DB, so it can be edited without a
   redeploy).
2. **Upload** (`/upload`) — player picks their name from the fixed dropdown, picks the
   bookmaker (or types a new one), uploads a slip screenshot. The app shows the
   AI-extracted fields for a quick eyeball-confirm before saving (players can fix
   obvious OCR mistakes here too, e.g. wrong team name) — full corrective power stays
   with admin, but a lightweight "does this look right?" confirm step avoids obviously
   bad data going in.
3. **Ranking** (`/` or `/ranking`) — the betc\*nt leaderboard: table of all 6 players
   sorted per §4, plus a per-player detail view (bet history, win rate, current
   streak) and simple charts (primary score over time, legs-won distribution).
4. **Admin** (`/admin`, auth-required) — full CRUD on bets/legs/players/bookmakers;
   re-run or manually trigger the settlement job; override any parsed or settled
   field with an audit trail (`admin_audit_log`); view raw AI extraction JSON
   alongside the slip image side-by-side for corrections; manage the fixed player and
   bookmaker lists.

### 6.2 Non-functional requirements

- **Auditability**: every admin change to a bet/leg after initial creation is logged
  (old value, new value, timestamp) in `admin_audit_log`.
- **Idempotency**: re-running the settlement job for an already-settled leg is a
  no-op unless `admin_override` forces a re-check.
- **Image handling**: slip screenshots stored in Supabase Storage, private bucket,
  signed URLs only; retained indefinitely (small volume — one per week).
- **Error handling**: if AI extraction fails or returns low-confidence/incomplete
  data, the bet is saved as `pending_review` with whatever fields were extracted,
  flagged for admin attention rather than silently dropped.
- **Rate limits**: API-Football free tier (≈100 requests/day) — the settlement job
  batches lookups (one call per fixture date/league rather than per leg) and caches
  fixture data in a local `fixtures_cache` table to stay well under quota.
- **Mobile optimisation**: the app must be fully usable on mobile screens — this is
  not a "nice to have," since players will realistically upload slips and check the
  ranking from their phones far more often than from a desktop. Concretely:
  - The header navigation must **collapse to a hamburger/menu icon below the `sm`
    breakpoint** (~640px), opening either a dropdown or a slide-in panel listing
    Ranking / Upload Slip / Rules / Admin, rather than wrapping nav links onto
    multiple cramped lines next to the logo.
  - All pages (Ranking table, Upload flow, Rules, Admin) must be laid out
    responsively — tables that would overflow a phone width scroll horizontally
    within their own container rather than breaking the page layout; forms and
    buttons are touch-sized (minimum ~44px tap targets); no fixed-width layouts
    that force horizontal scrolling of the whole page.
  - The Upload page in particular should support picking a photo directly from the
    phone's camera/gallery (a plain `<input type="file" accept="image/*" capture>`
    covers this without extra libraries), since that's the primary real-world
    upload path.
  - Treat mobile as the primary target and desktop as the secondary, wider
    breakpoint — design mobile-first and expand up, rather than the reverse.

## 7. Branding & Look-and-Feel

- Overall visual style follows the attached Betfair sportsbook reference screenshot:
  dark charcoal/black background, bold **yellow** (`#FFB80C`-ish) as the primary
  accent for CTAs and highlights, white text, dense/functional layout with clear data
  tables — Bet1865 should read as a "betting-site" dashboard, not a generic SaaS app.
- The **betc\*nt** wordmark/logo is the attached image (black wordmark on white/transparent,
  with the stylised up/down triangle-arrow icon in place of the apostrophe-adjacent
  glyph, and the middle letter censored as `betc*nt`) — used as-is for the site's
  logo/favicon treatment; save the source PNG into `public/` (e.g.
  `public/logo-betcnt.png`) at project scaffold time and reference it in the header
  and favicon.
- A dark theme is primary; a light theme is not required for v1 unless requested.
- The theme and component choices must hold up at mobile widths, not just the
  desktop reference screenshot — see the mobile-optimisation requirement in §6.2.

## 8. Explicit v1 Scope Boundaries (assumptions to confirm)

- No enforced weekly rotation/scheduling logic — admin/players self-organise whose
  turn it is; the app just records whoever's name is picked at upload time. (Can be
  added later as a "rota" feature if wanted.)
- No player login/accounts in v1, per your decision — anyone with the link can
  upload a bet as any player. Acceptable for a private friend-group app; can be
  revisited if misuse becomes a problem.
- Settlement of the Betfair 90-minute in-play rule follows the deterministic
  goal-event algorithm in §3.9. It depends on API-Football's `/fixtures/events` feed
  correctly tagging stoppage-time goals (`time.extra`); on the rare occasion that
  feed is missing or inconsistent for a fixture, §3.9 step 5 routes that leg to
  `pending_review` rather than guessing, and admin resolves it by hand via the Admin
  page using the slip + any other source (e.g. BBC Sport minute-by-minute).
- Single "season" — no season resets/archiving in v1; all-time totals. Can add season
  boundaries later if wanted.
