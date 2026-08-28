-- Bet1865 initial schema. Source of truth: SPEC.md §5.
-- Run via `supabase db push` or the Supabase SQL editor.

create extension if not exists pgcrypto;

create table players (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table bookmakers (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null unique,
  is_betfair_exchange   boolean not null default false,
  created_at            timestamptz not null default now()
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
  slip_image_path     text not null,
  stake               numeric(10,2) not null default 10.00,
  slip_return_amount  numeric(10,2) not null,
  status              bet_status not null default 'pending_review',
  winnings            numeric(10,2),
  parsed_by_ai        boolean not null default true,
  ai_raw_response     jsonb,
  admin_verified      boolean not null default false,
  admin_notes         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table bet_legs (
  id                          uuid primary key default gen_random_uuid(),
  bet_id                      uuid not null references bets(id) on delete cascade,
  leg_number                  smallint not null check (leg_number between 1 and 3),
  league                      league_code not null,
  home_team                   text not null,
  away_team                   text not null,
  match_datetime              timestamptz not null,
  predicted_outcome           predicted_outcome not null,
  odds                        numeric(6,2) not null check (odds >= 2.00),
  external_fixture_id         text,
  status                      leg_status not null default 'pending',
  score_home_90               smallint,
  score_away_90               smallint,
  score_home_ft                smallint,
  score_away_ft               smallint,
  settled_via_stoppage_flip   boolean not null default false,
  settlement_notes            text,
  settled_at                  timestamptz,
  admin_override              boolean not null default false,
  unique (bet_id, leg_number)
);

create table fixture_goal_events (
  id                    uuid primary key default gen_random_uuid(),
  external_fixture_id   text not null,
  scoring_team          text not null,
  is_own_goal           boolean not null default false,
  minute_elapsed        smallint not null,
  minute_extra          smallint,
  is_after_89_59        boolean not null,
  fetched_at            timestamptz not null default now(),
  unique (external_fixture_id, minute_elapsed, minute_extra, scoring_team, is_own_goal)
);

create table admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,
  entity_id     uuid not null,
  field_changed text not null,
  old_value     text,
  new_value     text,
  changed_by    text not null default 'admin',
  changed_at    timestamptz not null default now()
);

-- betc*nt ranking view — derives primary/secondary scores per SPEC.md §4.
-- Primary: +1 per lost bet. Secondary: +1 per winning leg, +2 bonus per clean-sweep bet.
create view player_rankings as
with leg_agg as (
  select
    b.player_id,
    b.id as bet_id,
    b.status as bet_status,
    count(*) filter (where bl.status = 'won') as legs_won,
    count(*) as legs_total
  from bets b
  join bet_legs bl on bl.bet_id = b.id
  group by b.player_id, b.id, b.status
)
select
  p.id as player_id,
  p.name,
  coalesce(sum(case when la.bet_status = 'lost' then 1 else 0 end), 0) as primary_score,
  coalesce(sum(la.legs_won), 0)
    + coalesce(sum(case when la.legs_won = 3 and la.legs_total = 3 then 2 else 0 end), 0)
    as secondary_score,
  count(la.bet_id) filter (where la.bet_status in ('won','lost')) as bets_settled,
  count(la.bet_id) filter (where la.bet_status = 'won') as bets_won
from players p
left join leg_agg la on la.player_id = p.id
group by p.id, p.name
order by primary_score asc, secondary_score desc;

-- RLS: public read on game data, writes via service role only (server routes).
alter table players enable row level security;
alter table bookmakers enable row level security;
alter table bets enable row level security;
alter table bet_legs enable row level security;
alter table fixture_goal_events enable row level security;
alter table admin_audit_log enable row level security;

create policy "public read players" on players for select using (true);
create policy "public read bookmakers" on bookmakers for select using (true);
create policy "public read bets" on bets for select using (true);
create policy "public read bet_legs" on bet_legs for select using (true);
-- No public policies on fixture_goal_events / admin_audit_log: service-role only.
