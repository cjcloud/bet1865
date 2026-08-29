-- Fixture lookup for auto-populating a leg's league/kick-off/external_fixture_id
-- from API-Football (SPEC.md §3.12). Candidates are staged here between a
-- "Find fixture" search and the uploader/admin picking one (disambiguation
-- when two fixtures match, e.g. a league game and a cup tie in the same
-- window) — cleared once a leg is fully saved via the confirm screen.

create table bet_leg_fixture_candidates (
  id                  uuid primary key default gen_random_uuid(),
  bet_id              uuid not null references bets(id) on delete cascade,
  leg_number          smallint not null check (leg_number between 1 and 3),
  external_fixture_id text not null,
  competition_slug    text not null,   -- PL | CHAMPIONSHIP | LEAGUE_ONE | LEAGUE_TWO | FA_CUP | EFL_CUP
  competition_label   text not null,   -- human-readable, e.g. "FA Cup"
  home_team           text not null,
  away_team           text not null,
  kickoff             timestamptz not null,
  venue               text,
  chosen              boolean not null default false,
  created_at          timestamptz not null default now(),
  unique (bet_id, leg_number, external_fixture_id)
);

create index if not exists bet_leg_fixture_candidates_lookup
  on bet_leg_fixture_candidates (bet_id, leg_number);

-- Service-role only, same as bets/bet_legs (SPEC.md §6.2 RLS rules).
alter table bet_leg_fixture_candidates enable row level security;
drop policy if exists "Service role manages fixture candidates" on bet_leg_fixture_candidates;
create policy "Service role manages fixture candidates"
  on bet_leg_fixture_candidates for all
  to service_role
  using (true)
  with check (true);
