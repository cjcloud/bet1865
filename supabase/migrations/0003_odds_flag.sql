-- Corrects an earlier design mistake: bet_legs.odds had a `>= 2.00` check
-- constraint, which caused the app to silently discard any leg priced below
-- evens instead of recording it. Per SPEC.md §3.10, the app must accept and
-- record every slip exactly as it reads, and red-flag (never reject/drop)
-- any leg priced under the group's evens-or-better house rule.

-- Drop the old floor. Postgres's default name for an inline column check is
-- "<table>_<column>_check".
alter table bet_legs drop constraint if exists bet_legs_odds_check;

-- Keep a sanity floor (odds must be a real positive price) without enforcing
-- the game's evens rule at the database level.
alter table bet_legs add constraint bet_legs_odds_positive check (odds > 0);

-- Generated column: always in sync with odds, no application logic can let
-- it drift. True whenever a leg breaks the evens-or-better house rule.
alter table bet_legs add column if not exists below_minimum_odds boolean
  generated always as (odds < 2.00) stored;
