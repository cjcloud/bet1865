-- Rollback for migrations/0010_total_predicted_return_tiebreak.sql.
--
-- IMPORTANT: roll the application back first. The new application selects
-- total_predicted_return and will fail if this database rollback runs while
-- that application version is still live.
--
-- This restores player_rankings to its exact pre-0010 shape and ordering.

begin;

drop view if exists player_rankings;

create view player_rankings as
with leg_agg as (
  select
    b.player_id,
    b.id as bet_id,
    b.status as bet_status,
    b.reconciliation as bet_reconciliation,
    b.win_star as bet_win_star,
    count(*) filter (where bl.status = 'won') as legs_won,
    count(*) as legs_total
  from bets b
  join bet_legs bl on bl.bet_id = b.id
  group by b.player_id, b.id, b.status, b.reconciliation, b.win_star
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
  count(la.bet_id) filter (where la.bet_status = 'won') as bets_won,
  coalesce(sum(case when la.bet_win_star then 1 else 0 end), 0) as win_star_count
from players p
left join leg_agg la on la.player_id = p.id
group by p.id, p.name
order by primary_score desc, win_star_count desc, secondary_score asc;

grant select on player_rankings to anon, authenticated;

commit;
