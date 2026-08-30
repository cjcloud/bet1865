-- Adds the "win*" feature, per CJ's request (30 Aug 2026, session 4):
-- on a Betfair Exchange bet, a leg's prediction can be satisfied at the
-- 90-minute mark and settled as a win even though the actual full-time
-- result would not have satisfied it (SPEC.md section 3.8). The betc*nt
-- score (primary_score) is based on losses, so a 90-minute-rule win can
-- lower a player's betc*nt count in a way a "cleaner" win wouldn't -- win*
-- exists so the Ranking table can use it as a tiebreak signal ahead of
-- Prediction Score, per CJ's tiebreak ordering: betc*nt count, then win*
-- count, then Prediction Score.
--
-- Two new columns:
--   bet_legs.settled_via_90min_rule (bool, default false) -- the admin sets
--     this when marking a leg Won, if the leg was in fact won only because
--     of Betfair's 90-minute rule (would have lost at full time).
--   bets.win_star (bool, default false) -- derived and stored by the app
--     (src/lib/settlement.ts: deriveWinStar) whenever a bet's status is
--     recalculated: true iff the bet is won AND at least one won leg has
--     settled_via_90min_rule = true.
--
-- player_rankings is rebuilt to add win_star_count (count of a player's
-- win* bets) and to change its own default ORDER BY to the new three-level
-- tiebreak: primary_score desc, win_star_count desc, secondary_score asc.
-- As with migration 0006, the app's own .order() calls on the Ranking page
-- override this regardless -- this keeps the view's own default consistent
-- for any future direct SQL query against it.
--
-- win_star_count is appended as the LAST select-list column (after
-- bets_settled/bets_won, not next to primary_score/secondary_score where it
-- conceptually belongs) because CREATE OR REPLACE VIEW only allows adding
-- columns at the end -- Postgres matches existing view columns positionally,
-- so inserting a new one in the middle would try to rename bets_settled to
-- win_star_count and fail with error 42P16. The app selects columns by name,
-- so this ordering has no effect on anything.

alter table bet_legs add column if not exists settled_via_90min_rule boolean not null default false;
alter table bets add column if not exists win_star boolean not null default false;

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
