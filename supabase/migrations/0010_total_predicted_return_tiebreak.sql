-- Adds total predicted return as the final score-based ranking tiebreaker.
-- Ranking order: highest betc*nt count, lowest wins, highest Win* count,
-- lowest Prediction Score, then lowest combined predicted return. Chrimbo Cup
-- position will be inserted before the final name tiebreak when it launches.
-- Every placed bet is included, regardless of settlement status.
--
-- The new column is appended to preserve the existing view column positions,
-- as required by CREATE OR REPLACE VIEW.

create or replace view player_rankings as
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
), return_agg as (
  select
    player_id,
    coalesce(sum(slip_return_amount), 0) as total_predicted_return
  from bets
  group by player_id
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
  coalesce(sum(case when la.bet_win_star then 1 else 0 end), 0) as win_star_count,
  coalesce(ra.total_predicted_return, 0) as total_predicted_return
from players p
left join leg_agg la on la.player_id = p.id
left join return_agg ra on ra.player_id = p.id
group by p.id, p.name, ra.total_predicted_return
order by primary_score desc, bets_won asc, win_star_count desc, secondary_score asc,
  total_predicted_return asc;
