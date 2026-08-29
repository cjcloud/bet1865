-- Phase 4: manual settlement. SPEC.md §3.7a, §3.9a, §5 (v1.1 + v1.3 changelogs).
-- Run this in the Supabase SQL editor same as the earlier migrations.

-- v1.1: drop the columns/tables that only existed to support the now-parked
-- automated fixture-lookup/settlement pipeline (§3.9, §3.12).
alter table bet_legs drop column if exists external_fixture_id;
alter table bet_legs drop column if exists score_home_90;
alter table bet_legs drop column if exists score_away_90;
alter table bet_legs drop column if exists settled_via_stoppage_flip;

drop table if exists fixture_goal_events;
drop table if exists bet_leg_fixture_candidates;

-- v1.3: records which §3.7a reconciliation path (if any) a bet went
-- through. Purely descriptive/auditing — the actual outcome is still just
-- bets.status + bets.winnings, same as before.
create type bet_reconciliation as enum ('standard', 'voided_full_refund', 'manual_bookmaker_return');

alter table bets add column if not exists reconciliation bet_reconciliation not null default 'standard';

-- Rebuild player_rankings (§4): a bet reconciled as 'voided_full_refund' must
-- contribute nothing to either score, and not count as a bet played — not
-- just be excluded from bets_settled/bets_won, but also have its individual
-- leg wins excluded from the secondary score (a leg could have been marked
-- Won before the admin decided to void the whole bet).
create or replace view player_rankings as
with leg_agg as (
  select
    b.player_id,
    b.id as bet_id,
    b.status as bet_status,
    b.reconciliation as bet_reconciliation,
    count(*) filter (where bl.status = 'won') as legs_won,
    count(*) as legs_total
  from bets b
  join bet_legs bl on bl.bet_id = b.id
  group by b.player_id, b.id, b.status, b.reconciliation
)
select
  p.id as player_id,
  p.name,
  coalesce(sum(case when la.bet_status = 'lost' then 1 else 0 end), 0) as primary_score,
  coalesce(
    sum(case when la.bet_reconciliation = 'voided_full_refund' then 0 else la.legs_won end), 0
  ) + coalesce(
    sum(
      case
        when la.bet_reconciliation <> 'voided_full_refund'
         and la.legs_won = 3 and la.legs_total = 3
        then 2 else 0
      end
    ), 0
  ) as secondary_score,
  count(la.bet_id) filter (
    where la.bet_status in ('won', 'lost')
  ) as bets_settled,
  count(la.bet_id) filter (where la.bet_status = 'won') as bets_won
from players p
left join leg_agg la on la.player_id = p.id
group by p.id, p.name
order by primary_score asc, secondary_score desc;
