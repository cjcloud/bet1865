-- Flips player_rankings' own default ORDER BY to match the app's Ranking
-- page: highest betc*nt count (most COTW's) first, Prediction Score
-- breaking a tie the same direction (fewest leg wins among tied players
-- ranks higher/worse). The app's query already specifies its own .order()
-- calls that override this regardless, but keeping the view's own default
-- consistent avoids a surprise for any future direct SQL query against it.
-- Same select list as migration 0005 — only the trailing ORDER BY changes.

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
order by primary_score desc, secondary_score asc;
