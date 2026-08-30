# Bet1865 — Project Specification

Version 1.9 — 30 August 2026
Owner / Admin: CJ

**Changelog (v1.9, 30 Aug 2026)**: Implemented Phase 6 (SPEC.md §6.3): retrospective
amend of any bet-level or leg-level field — including a slip that's already fully
settled Won/Lost/Void — and batch delete of multiple bet slips at once. The confirm/
edit screen (`/admin/upload/confirm/[id]`, already used for the post-upload check)
is now also the amend screen, extended with Player/Bookmaker reassignment and an
Admin notes field, and every change it saves is now written to `admin_audit_log`
(previously this screen logged nothing). Amending a stake or slip return amount on
an already-settled bet re-derives that bet's status/winnings/win\* automatically
(SPEC.md §3.7/§4), so a correction is immediately reflected in the betc\*nt
rankings — a Void leg is left untouched either way, since that stays the dedicated
§3.7a reconciliation control's job. All Bets (`/admin/bets`) gained checkboxes and
a "Delete selected" control so several mistaken/duplicate slips can be removed in
one confirmed action instead of one at a time; each still gets its own
`admin_audit_log` snapshot before removal, same as a single delete. See the
updated §6.1 and §6.3 below.

**Changelog (v1.8, 30 Aug 2026)**: Added the **win\*** feature, per CJ's request. A Betfair Exchange leg can win purely because of §3.8's 90-minute rule — i.e. it would have *lost* on the actual full-time result. Since the betc\*nt score is loss-based, this kind of win can flatter a player's betc\*nt count more than a "clean" win would, so it's now tracked as a tiebreaker signal: `bet_legs.settled_via_90min_rule` (admin-set on settlement, §3.9a) and `bets.win_star` (derived, §4) are new columns (migration `0008_win_star.sql`), and the Ranking table's tiebreak is now three levels deep — betc\*nt count, then win\* count, then Prediction Score (§4). See the updated §3.8, §3.9a, §4, §5, and §6.1 below.

**Changelog (v1.7, 30 Aug 2026)**: CJ asked for the two domestic cup competitions to be added as eligible competitions for a leg (§3 point 2). `league_code` gains two new enum values, `FA_CUP` and `EFL_CUP` (migration `0007_add_cup_leagues.sql`), and the AI slip-extraction prompt, the admin's league dropdown, and every page that renders a league label were updated together so a cup-tie leg can be entered end-to-end, not just described here. §3.12a's earlier statement that a cup fixture is "not a valid leg" is now superseded — see the updated wording there.

**Changelog (v1.1, 29 Aug 2026)**: Automated fixture lookup and automated result
settlement via a third-party API were blocked by API-Football's free-tier plan not
including current-season data (see v1.0's §3.12 note). A follow-up investigation
into scraping public results pages as a free alternative found a workable technical
approach (worldfootball.net match reports carry goal-minute detail) but ran into
terms-of-service restrictions on automated retrieval, even for personal,
non-commercial use. **CJ decided to park both approaches for v1** and go fully
manual instead: the admin/uploader types each leg's kick-off date/time by hand, and
the admin registers a **Win/Lose (or Void)** per leg once the real result is known,
from which the bet's overall status and the rankings are derived automatically as
before. §3.9 and §3.12 below are retained for reference (marked **Parked**) in case
a paid data source is adopted later, and replaced by §3.9a and §3.12a describing the
current manual approach.

**Changelog (v1.2, 29 Aug 2026)**: Clarified how the admin determines a Betfair leg's
Won/Lost status (§3.8, §3.9a). The 90-minute rule applies **only** to Betfair
Exchange legs, and the admin doesn't re-derive it from a scoreline or apply any
judgement themselves — **Betfair's own website already settles each leg with the
90-minute rule baked in**, so the admin simply reads the leg's settled status
straight off the Betfair site and enters that Win or Lose into the app. For every
other bookmaker, the admin determines Won/Lost from the conventional full-time
result — no 90-minute nuance applies, so any result source is fine.

**Changelog (v1.3, 29 Aug 2026)**: Added a required reconciliation step for **Void**
legs (§3.7a). A void leg breaks the simple all-win/any-loss roll-up in §3.7, because
a real bookmaker recalculates the bet's return around a voided leg (e.g. a treble
becomes a double at the remaining legs' odds) — a recalculation this app does not
attempt to model. Whenever any leg is Void, the automatic roll-up no longer fires;
the admin must explicitly either void the whole bet (full stake refund, excluded
from scoring) or type in the bookmaker's actual recalculated return. See §3.7a and
§4's scoring update.

**Changelog (v1.4, 29 Aug 2026)**: Made explicit that the admin can **amend any
field** on an existing bet/leg (not just the corrections already described
elsewhere) and can **delete** a bet slip entirely — e.g. a duplicate upload, a slip
recorded against the wrong player, a test entry. See new §6.3.

**Changelog (v1.5, 29 Aug 2026)**: Three changes from live use once Phases 4-5 were
running in front of CJ:
- **Admin split fully away from general users (§6, §6.1).** Players never upload
  their own slip — they post the photo in the group's WhatsApp chat and the admin
  uploads it. Upload moved from a public page to an admin-only one
  (`/admin/upload`), and the Admin nav entry is hidden entirely from a signed-out
  visitor (not merely auth-gated behind a visible link) — a general user's nav is
  Ranking / View Slips / Rules only. The admin-only API route the upload page calls
  is protected the same way, returning 401 instead of redirecting, since it's
  called via `fetch` rather than a page navigation.
- **Ranking sort order reversed (§4, §6.1).** The betc\*nt leaderboard now lists the
  **highest** betc\*nt count first — a player's betc\*nt count is described in-app
  as "your number of COTW's" — rather than the original
  best-first ("lowest wins") framing. Prediction Score breaks a tie in the same
  worst-first direction (fewest leg wins among tied players ranks higher).
- **"Secondary betc\*nt score" renamed to "Prediction Score" (§4).** Same
  computation as before (leg wins + clean-sweep bonus); the name change makes its
  role as the betc\*nt-tie tiebreaker explicit rather than an unlabelled "form"
  indicator.

**Changelog (v1.6, 29 Aug 2026)**: Two small confirmations from CJ after reviewing
v1.5's changes:
- **Prediction Score tiebreak direction confirmed (§4).** A higher Prediction
  Score reflects better betting acumen; a higher betc\*nt count reflects *worse*
  acumen (more losing bets). So when two players are level on betc\*nt count, the
  one with the **lower** Prediction Score — the worse predictor — sits **above**
  the one with the higher Prediction Score, consistent with the Ranking table's
  "higher position = lower success" ordering. No behavioural change — this was
  already how §4 and the app's `.order()` calls worked; it's now confirmed rather
  than inferred.
- **"COTW" stays an unexpanded acronym.** The v1.5 changelog and §4 had spelled it
  out as "Cunt Of The Week" in a couple of places; CJ asked for it to remain just
  the initialism everywhere in-app and in this spec. Removed the expansion from
  §4 and this changelog; §3's and §6.1's existing unexpanded references were
  already correct.

## 1. Purpose

Bet1865 tracks a recurring social betting game played by six friends. Each week one
player places a £10 treble (3-leg accumulator) across the top four English football
divisions and posts a screenshot of the bet slip in the group's WhatsApp chat. The
**admin uploads that slip to the app, manually enters each leg's kick-off
date/time, and — once the match has been played — registers a Win or Lose for each
leg** — from which the app derives the bet's outcome and updates a running
leaderboard — the **"betc\*nt" ranking** — that scores players on both outcomes
(won/lost the bet) and performance (how many legs came in).

## 2. Players

Six named players, fixed list, managed by admin:

`John, Clive, Dingle, Chris, Simon, Moony`

Players do not log in (see §6.2) and do not use the app to place or upload
anything — the app's only input from a player is the bet slip screenshot they post
in WhatsApp, which the admin then uploads on their behalf. In the app itself,
players are simply the "owner" field on a bet record, selected from a dropdown by
the admin when uploading.

## 3. The Game — Canonical Rules

These rules are the source of truth for the in-app **Rules** page and for all scoring
logic. Any change to this section must be mirrored on that page.

1. Each week, one of the six players places a **treble** (3-leg accumulator) bet.
2. All three legs must be football matches from an **eligible English competition**:
   the top-flight domestic pyramid (Premier League, EFL Championship, EFL League One,
   EFL League Two) or one of the two domestic cups (the **FA Cup** and the **EFL Cup /
   Carabao Cup**) — added to the eligible list in v1.7.
3. Each leg is *intended* to be priced at **Evens (decimal 2.0) or better** (i.e. odds
   ≥ 2.0) at the time the bet is placed — but the app never rejects an upload for
   breaking this. Every slip is accepted and recorded exactly as it reads; any leg
   priced below 2.0 is **red-flagged** for admin attention rather than blocked or
   silently dropped (see §3.10).
4. Stake is fixed at **£10** per bet.
5. The player posts a screenshot of the bet slip in the group's WhatsApp chat, and
   the admin uploads it to the app (see §6, §6.1 — this is an admin-only action,
   not something the player does themselves).
6. The app extracts and stores: bet date, each leg's home/away teams, the predicted
   outcome per leg, the odds per leg, the total stake, the potential return shown on
   the slip, the bet owner, and the bookmaker. The admin fills in (or corrects) each
   leg's **league** and **kick-off date/time** by hand — see §3.12a.
7. **Settlement**: the bet is reconciled from admin-entered leg results (see §3.9a).
   - If **any of the three legs loses**, the whole bet loses and **winnings = £0**,
     regardless of what the slip's stated return was.
   - If **all three legs win**, **winnings = the return amount printed on the bet
     slip** (not recalculated from odds — the slip figure is authoritative, to account
     for bookmaker-specific rounding, boosts, etc.).
   - If **any leg is Void**, this simple roll-up does not apply — see §3.7a, a
     required admin reconciliation step.
8. **Betfair Exchange special case** — applies **only** to legs placed with Betfair
   Exchange (`bookmakers.is_betfair_exchange = true`); every other bookmaker settles
   on the plain full-time result, no exception. Betfair Exchange settles in-play bets
   on the match state at the 90-minute mark (end of normal time), with one asymmetric
   exception:
   - If a leg is **winning at the 90-minute mark**, it is settled as a **win**, even
     if the scoreline changes again before the final whistle (i.e. an equaliser or
     late goal in stoppage time does **not** undo an already-winning leg).
   - If a leg is **losing at the 90-minute mark** but the scoreline changes before
     the final whistle such that the leg **would then be winning**, that leg **is**
     settled as a win.
   - In short: `leg_result = WIN if (winning_at_90min OR winning_at_fulltime)`, for
     Betfair-sourced legs only.
   - **The admin never derives this themselves.** Betfair's own website already
     settles each leg of the bet applying this exact 90-minute rule — so for a
     Betfair leg, the admin simply looks up how Betfair itself settled that leg
     (via the Betfair site/app) and enters the resulting Won or Lost into Bet1865.
     No scoreline reconstruction, no goal-timeline lookup, no judgement call — it's
     a direct transcription of Betfair's own settlement. See §3.9a.
   - **win\* (v1.8)**: because a leg can be settled Won at 90 minutes while the
     actual full-time result would **not** have satisfied the prediction, the app
     separately tracks *how* a Betfair win happened. When registering a Betfair
     leg as Won, the admin additionally flags whether it only won via this
     90-minute rule (`bet_legs.settled_via_90min_rule`) — this **does** require a
     one-off look at the full-time score, unlike the plain Won/Lost transcription
     above. A bet is a **win\*** (`bets.win_star`) if it's won and at least one of
     its legs carries this flag. win\* has no effect on winnings or on whether the
     bet counts as won — it exists purely as a Ranking tiebreaker (§4).

### 3.7a Void legs — required admin reconciliation

A **Void** leg status (§5's `leg_status` enum) means the match didn't produce a
result the bet can be judged on — postponed, abandoned, or voided by the bookmaker
for some other reason. This breaks §3.7's simple roll-up: a real bookmaker doesn't
just drop the voided leg and pay out as if it were a 2-leg bet at the original
treble odds — it recalculates the return around the remaining legs (e.g. a treble
with one void leg becomes a double, settled at the odds of the two legs that did
play), a recalculation this app has no odds-modelling to reproduce.

So: **whenever any leg on a bet is Void, the automatic status/winnings roll-up
(§3.9a) does not fire.** The bet stays in `pending_settlement` (even if the other
two legs are already Won/Lost) until the admin explicitly reconciles it in Admin,
choosing one of two actions:

1. **Void the whole bet.** Sets `bets.status = 'void'` and `bets.winnings = stake`
   (the full £10 stake is treated as refunded — not a win, not a loss). Use this
   when the bookmaker fully voids the bet rather than just the one leg, or when the
   admin decides not to chase down the bookmaker's recalculated figure.
2. **Enter the bookmaker's recalculated return.** The admin types in the actual
   payout amount shown by the bookmaker's own settlement of the reduced bet (e.g.
   what the double paid out). The app stores this as `bets.winnings` as-is (no
   further recalculation) and sets `bets.status = 'won'` if that figure is greater
   than zero, or `'lost'` if it's exactly zero — so the bet is recorded and scored
   exactly like any normally-settled bet.

Either action still requires the other two (non-void) legs to have their own
Won/Lost status registered as normal (§3.9a) — those individual leg statuses still
drive the secondary betc\*nt score's leg-win count (§4) regardless of which
reconciliation option is chosen for the bet as a whole. Both actions are one-way
admin decisions logged to `admin_audit_log` like any other change (§6.2); either can
be corrected later by the admin re-opening the reconciliation and choosing again.

### 3.9 [Parked] Precise algorithm for the 90-minute cut-off (goal-event driven)

This section described a fully automated algorithm that would reconstruct the
90-minute score from a results API's goal-event timeline (`time.elapsed`/
`time.extra` per goal) and apply §3.8's asymmetric rule without any admin judgement
call. It required a data source that could supply a minute-by-minute goal timeline
for all four English divisions on the current season — no free option meeting that
bar was found (API-Football's free plan excludes the current season entirely;
scraping public results sites that do carry goal-minute detail, e.g.
worldfootball.net, ran into terms-of-service restrictions on automated retrieval).
**Parked for v1** — see §3.9a for the manual replacement, which turns out not to need
reviving even conceptually for Betfair legs, since Betfair's own site already applies
this exact rule (§3.8) before the admin ever sees it. If a paid data feed is adopted
later for the *other* bookmakers' full-time results, the original algorithm (goal
classification into normal-time vs after-89:59, the two-scoreline computation, the
flip rule, and the data-quality guard routing inconsistent results to
`pending_review`) could still be revived for cross-checking Betfair's settlement,
but that's a "nice to have," not a gap in the current design.

### 3.9a Manual settlement (current v1 approach)

Once a leg's match has been played, the admin opens that bet in **Admin** and
registers each leg's outcome directly:

- **Won**, **Lost**, or **Void** per leg (§5's existing `leg_status` enum — no new
  enum values needed).
  - **Betfair-sourced leg**: the admin reads the leg's already-settled status
    straight off the Betfair website/app — which has already applied §3.8's
    90-minute rule — and enters that as Won or Lost. This is a transcription, not
    a judgement call. If it's registered Won, the admin also flags (v1.8) whether
    it only won because of the 90-minute rule — i.e. the actual full-time result
    would have lost — by checking the box against that leg; this sets
    `bet_legs.settled_via_90min_rule` and feeds into the bet's win\* flag (§3.8,
    §4).
  - **Every other bookmaker**: the admin determines Won/Lost from the conventional
    full-time result, from any result source they trust (BBC Sport, the
    bookmaker's own settled-bet record, etc.) — no 90-minute nuance applies.
  - **Void**: used when the match didn't produce a usable result (postponed,
    abandoned, bookmaker-voided). Registering any leg as Void **requires** the
    admin to then complete the §3.7a reconciliation — the bet cannot auto-settle
    with a void leg present.
- An optional free-text `settlement_notes` field per leg lets the admin record
  *why* if it's ever not obvious — e.g. "per Betfair site settlement" or "BBC
  full-time score used" or "match postponed, see bet-level void reconciliation" —
  for their own future reference and for auditability.
- As soon as all three legs of a bet have a Won/Lost status (**and no leg is
  Void**), the app **automatically derives the bet's overall status and winnings**
  per §3.7 (any loss ⇒ `lost`/£0; all three won ⇒ `won`/slip's stated return) — no
  separate "settle the bet" step is needed beyond registering the three legs. A bet
  with any leg still `pending` stays in `pending_settlement`. A bet with **any**
  leg `void` also stays in `pending_settlement` until the admin completes the
  §3.7a reconciliation, regardless of the other two legs' statuses.
- Every leg-status change is written to `admin_audit_log` (old value, new value,
  timestamp) exactly like any other admin correction (§6.2), including a
  correction to an already-settled leg — re-marking a leg recomputes the bet's
  status/winnings immediately (except where a void leg requires the §3.7a
  reconciliation instead), so mistakes are simple to fix.
- The **betc\*nt** rankings (§4) are derived from settled bets exactly as before;
  nothing about the scoring rules changes — only *how* a leg's result gets into
  the system changes, from an automated API pull to an admin's manual entry.

### 3.10 Odds below the evens minimum — flag, never reject

Rule 3 says legs are *intended* to be priced at 2.0 or better, but real slips
sometimes don't comply (a player misjudges a leg, or includes a short-priced
favourite). The app's job is to faithfully record what the slip actually shows, not
to gatekeep what counts as a valid upload — so:

- `bet_legs.odds` has **no lower-bound constraint** in the database. Whatever decimal
  value the slip shows (or the admin corrects it to) is stored as-is.
- `bet_legs.below_minimum_odds` is a generated column (`odds < 2.00`) — always
  correct, never drifts out of sync with `odds`.
- Any leg with `below_minimum_odds = true` is surfaced as a visible red flag on the
  confirm screen and in Admin, so it's never quietly missed — but it does **not**
  block saving the bet, and does not by itself change settlement or scoring. Whether
  a flagged bet counts normally, gets voided, or needs a manual ruling is an admin
  judgement call (§6.1's Admin correction tooling), not something the app decides
  automatically.
- This replaces an earlier draft of this spec, which had the app silently discard
  any leg priced under 2.0 rather than record and flag it — that behaviour was
  wrong and has been corrected.

### 3.11 Fractional-to-decimal odds conversion (AI extraction)

UK bet slips commonly print **fractional odds** (e.g. `11/10`, `6/5`, `20/23`)
instead of decimal. The slip-parsing prompt (§6) must convert these correctly:

```
decimal_odds = 1 + (numerator / denominator)
```

Worked examples: `11/10` → 1 + 1.10 = **2.10**; `6/5` → 1 + 1.20 = **2.20**;
`20/23` → 1 + 0.8696 ≈ **1.87**. A fraction's digits must never be copied directly
as if they were already a decimal price (e.g. reading `11/10` as `1.10`) — that
silently halves the true odds and was an early bug in this app's extraction prompt,
corrected once found. Odds already printed in decimal format are used as-is, no
conversion needed.

### 3.12 [Parked] Fixture lookup — auto-populating league/kick-off from API-Football

This section described a "Find fixture" action on the confirm screen that searched
API-Football for a real fixture matching a leg's two teams and let the admin
confirm it to auto-fill league, kick-off, and an `external_fixture_id` later
reused for automated settlement. **Parked for v1**, blocked first by
API-Football's free plan excluding current-season fixture data, then by a
scraping-based alternative running into public results sites' terms-of-service
restrictions on automated retrieval (see the v1.1 changelog above). See §3.12a for
the manual replacement. If a paid fixture-data source is adopted later, the
disambiguation UX, hardcoded English competition IDs, and 7-day search window
described in the original design can be revived largely as-is.

### 3.12a Manual fixture date/time entry (current v1 approach)

On the confirm screen, the admin types (or corrects) each leg's **league** and
**kick-off date/time** directly — plain date/time input fields, no lookup or
auto-fill. This is exactly the fallback path the original design already relied on
for "no match found," now promoted to the only path:

- **League**: one of the 4 pyramid divisions (Premier League, Championship,
  League One, League Two) or one of the 2 domestic cups (FA Cup, EFL Cup) — a
  required field per leg, per §5's `league_code` enum. **v1.7**: cup ties are now
  a valid league selection (previously the admin had to resolve a cup-tie leg as
  a data-entry correction since no cup value existed in the enum — that workaround
  is no longer needed).
- **Kick-off date/time**: a plain date/time field (`match_datetime`), typed from
  what's legible on the slip or from the admin's own knowledge of the fixture. A
  "Set to nearest Saturday, 3pm" helper button offers a starting guess (most of
  the group's fixtures are the traditional Saturday 3pm slot) that the admin can
  freely overwrite — no automatic candidate matching or disambiguation is offered.
- This removes the need for `bet_leg_fixture_candidates` and
  `external_fixture_id` (§5) — those are dropped from the schema; see §5's
  changelog note.

## 4. Scoring — "betc\*nt" Ranking

Every player starts each season at **0 / 0**. Two scores, plus a win\* count
(v1.8), are tracked per player:

**betc\*nt count** (SPEC.md-internal name: primary score; a player's "number of
COTW's" in-app)
- +1 every time a bet **recorded for that player** ultimately **loses** (i.e.
  `bets.status = 'lost'`).
- Unaffected by wins.
- **Void bets are excluded entirely** (§3.7a option 1 — the whole bet voided,
  stake refunded): no betc\*nt-count delta, no Prediction Score delta, and the bet
  doesn't count towards "bets played" or win rate. It's as if the bet never
  happened, mirroring the bookmaker treating it as a non-event.
- A bet reconciled via §3.7a option 2 (the bookmaker's recalculated return entered
  manually, landing on `won` or `lost`) counts **normally** — exactly like any
  other settled bet — since by that point it has a real, bookmaker-confirmed
  outcome and return.

**win\*** (v1.8; **first tiebreaker** whenever two or more players are level on
betc\*nt count)
- A bet is a win\* when it's won (`bets.status = 'won'`) and at least one of its
  legs was flagged by the admin as won only via Betfair's 90-minute rule — it
  would have **lost** on the actual full-time result (§3.8, §3.9a).
- The win\* count is simply how many of a player's bets are win\*.
- A win\* still counts as a completely normal win for betc\*nt count and
  Prediction Score purposes — it only comes into play as this tiebreaker.

**Prediction Score** (SPEC.md-internal name: secondary score; used as the
**second tiebreaker, when players are level on both betc\*nt count and win\*
count**)
- +1 for **every individual leg that wins**, across all of that player's bets
  (0–3 per bet). A Void leg contributes neither a win nor a loss to this count —
  only the other legs' Won/Lost statuses count.
- +2 **bonus** on any bet where **all three legs win** (in addition to the +3
  already earned from the three individual leg wins above), i.e. a clean-sweep bet
  contributes +5 to the secondary score in total. A bet with any void leg can never
  qualify for this bonus, since not all three legs are Won.

The Ranking table sorts by betc\*nt count **descending** — the player with the
**highest** betc\*nt count (the most COTW's) is listed **first**. Ties break up to
two levels deeper (v1.8): first by win\* count **descending** (among players level
on betc\*nt count, the one with the *more* win\* bets — the less convincing wins —
ranks higher/worse), then, if still level, by Prediction Score **ascending** (the
one with the *lower* Prediction Score — the worse predictor — ranks higher/worse),
keeping the whole table consistently worst-to-best. Both scores, the win\* count,
plus bets played, win rate, and current streak, are shown per player.

### Worked example

| Bet | Legs won | Bet result | betc\*nt Δ | win\* | Prediction Score Δ |
|---|---|---|---|---|---|
| 1 | 3/3 | Won | +0 | — | +3 (legs) +2 (bonus) = +5 |
| 2 | 2/3 | Lost | +1 | — | +2 |
| 3 | 0/3 | Lost | +1 | — | +0 |
| 4 | 3/3 (1 leg via 90-min rule) | Won\* | +0 | win\* | +5 |

Totals after 4 bets: betc\*nt count = 2, win\* count = 1, Prediction Score = 12.

## 5. Data Model (Supabase / Postgres)

**Changelog (v1.1)**: `bet_legs.external_fixture_id`, `score_home_90`,
`score_away_90`, `settled_via_stoppage_flip`, the `fixture_goal_events` table, and
the `bet_leg_fixture_candidates` table all supported the now-parked automated
fixture-lookup/settlement pipeline (§3.9, §3.12) and are **dropped**. `leg_status`
is now set directly by the admin (§3.9a) rather than computed by a settlement job;
`score_home_ft`/`score_away_ft` are kept as optional fields the admin may fill in
for their own record-keeping, but nothing in the settlement logic depends on them.

**Changelog (v1.3)**: added `bets.reconciliation` to record which of §3.7a's two
paths (if any) a bet went through — purely descriptive/auditing, since the actual
outcome is still just `bets.status` + `bets.winnings` as before.

**Changelog (v1.4)**: no schema change — deletion (§6.3) uses the existing
`admin_audit_log` table to store a full JSON snapshot of a deleted bet before it's
removed, and amendment (§6.3) uses fields that already exist on `bets`/`bet_legs`.

**Changelog (v1.5)**: no schema change — the Ranking sort reversal (§4) and the
Prediction Score rename are query-level/presentation changes (the `player_rankings`
view's own default `ORDER BY` was flipped to match, but `primary_score`/
`secondary_score` remain the underlying column names).

**Changelog (v1.7)**: `league_code` gains `FA_CUP` and `EFL_CUP` (migration
`0007_add_cup_leagues.sql`), per §3 point 2's expanded eligible-competition list.
No other schema change.

**Changelog (v1.8)**: added `bet_legs.settled_via_90min_rule` (admin-set, boolean,
default false) and `bets.win_star` (derived, boolean, default false) — see §3.8,
§3.9a, §4 (migration `0008_win_star.sql`). `player_rankings` is rebuilt to add a
`win_star_count` column and to extend its default `ORDER BY` with
`win_star_count desc` between `primary_score desc` and `secondary_score asc`.

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
create type league_code as enum ('PL','CHAMPIONSHIP','LEAGUE_ONE','LEAGUE_TWO','FA_CUP','EFL_CUP');
create type predicted_outcome as enum ('HOME_WIN','AWAY_WIN','DRAW');
-- Records which §3.7a reconciliation path was used, if any (auditing/reporting only)
create type bet_reconciliation as enum ('standard','voided_full_refund','manual_bookmaker_return');

create table bets (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references players(id),
  bookmaker_id        uuid not null references bookmakers(id),
  bet_date            date not null,
  slip_image_path     text not null,        -- Supabase Storage object path
  stake               numeric(10,2) not null default 10.00,
  slip_return_amount  numeric(10,2) not null, -- "winnings if successful", from slip
  status              bet_status not null default 'pending_review',
  winnings            numeric(10,2),         -- derived on settlement: 0, slip_return_amount,
                                              -- stake (void refund), or the admin-entered
                                              -- bookmaker return (§3.7a)
  reconciliation      bet_reconciliation not null default 'standard', -- §3.7a, audit/reporting
  win_star            boolean not null default false, -- derived, §3.8/§4 tiebreaker (v1.8)
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
  league              league_code not null,          -- admin-entered, §3.12a
  home_team           text not null,
  away_team           text not null,
  match_datetime      timestamptz not null,          -- admin-entered, §3.12a
  predicted_outcome   predicted_outcome not null,
  odds                numeric(6,2) not null check (odds > 0), -- no 2.0 floor; see §3.10
  below_minimum_odds  boolean generated always as (odds < 2.00) stored, -- red-flag, never blocks (§3.10)
  status              leg_status not null default 'pending', -- admin-set directly, §3.9a
  score_home_ft       smallint,              -- optional, admin's own record-keeping only
  score_away_ft       smallint,
  settlement_notes    text,                  -- e.g. "per Betfair site settlement" (§3.9a)
  settled_at          timestamptz,
  settled_via_90min_rule boolean not null default false, -- admin-set, Betfair legs only (§3.8/§3.9a, v1.8)
  admin_override      boolean not null default false,
  unique (bet_id, leg_number)
);

-- append-only audit log for admin corrections (and, per §6.3, deletion snapshots)
create table admin_audit_log (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null,   -- 'bet' | 'bet_leg'
  entity_id     uuid not null,
  field_changed text not null,   -- e.g. a column name, or 'deleted' for a full-bet delete (§6.3)
  old_value     text,            -- for a delete, the full bet+legs JSON snapshot (§6.3)
  new_value     text,            -- null for a delete
  changed_by    text not null default 'admin',
  changed_at    timestamptz not null default now()
);
```

A `player_rankings` view (or nightly materialized view) derives the betc\*nt
count/win\* count/Prediction Score from `bets`/`bet_legs` per §4, so scores are
never stored redundantly — they're always recomputed from settled data (populated
by admin entry, §3.9a, rather than an automated job). Per §4, the view excludes any
bet with `reconciliation = 'voided_full_refund'` from all three scores and from
the bets-played/win-rate denominator, and its own default `ORDER BY` matches the
app's Ranking page — betc\*nt count descending, win\* count descending, Prediction
Score ascending (v1.8). Because the view is always derived live from whichever
`bets`/`bet_legs` rows currently exist, deleting a bet (§6.3) removes it from the
rankings automatically, with no separate recompute step.

## 6. Application Architecture

- **Framework**: Next.js (App Router, TypeScript), deployed on **Vercel**.
- **Database & storage**: **Supabase** (Postgres + Storage for slip images).
- **Source control / CI-CD**: local dev in `C:\Users\CJ\Dev\bet1865` (reached in
  coding sessions via the remote-devices bridge), pushed to **GitHub**, with
  Vercel's GitHub integration auto-deploying `main` to production and PRs to
  preview environments. CJ runs `git push` himself in every session — the coding
  assistant commits locally only.
- **Slip parsing**: an uploaded image → Anthropic **Claude vision API call**
  (server-side, using an Anthropic API key stored as a Vercel/Supabase secret) →
  structured JSON matching the `bets`/`bet_legs` schema → inserted as
  `pending_review` for the admin to confirm (or auto-confirm if confidence is
  high — configurable). Odds must be converted from fractional to decimal where
  the slip shows fractional pricing — see §3.11's formula and worked examples;
  this is a common real-slip case, not an edge case, since most UK bookmaker slips
  print fractional odds.
- **Fixture date/time (manual entry, §3.12a)**: the confirm screen offers plain
  league and kick-off date/time fields per leg for the admin to fill in or
  correct by hand. No external API call is made for this — the earlier
  API-Football-based "Find fixture" lookup is parked (§3.12).
- **Settlement (manual, admin-only, §3.9a)**: in Admin, the admin registers a
  Won/Lost/Void status per leg once the real result is known — for Betfair legs,
  by reading the leg's status straight off the Betfair site (§3.8, §3.9a); for
  every other bookmaker, from the plain full-time result. The app then derives the
  bet's overall status and winnings automatically per §3.7 as soon as all three
  legs have a Won/Lost result — no scheduled job, no external API call. If any leg
  is Void, this auto-derivation is replaced by the required §3.7a reconciliation
  (void the whole bet, or enter the bookmaker's recalculated return). The earlier
  automated goal-event-driven settlement engine is parked (§3.9).
- **Delete/amend (admin-only, §6.3, v1.9)**: the admin can amend any bet-level
  or covered leg field, even on an already-settled bet — the correction is
  audit-logged and, where it affects the settlement figures, re-derives
  status/winnings/win\* automatically — or delete a bet slip entirely, singly or
  in a batch — see §6.3 for the full behaviour, including the audit-log snapshot
  taken before each delete.
- **Auth (v1.5)**: **admin-only** authentication via Supabase Auth (single admin
  account, **magic link**). Only the pre-created admin user can sign in: "Allow new
  user signups" is disabled in Supabase Auth settings, so `signInWithOtp` only
  issues a link for that one existing user rather than letting any email create an
  account. Players are plain data rows with no login. `/admin/*` pages and the
  `/api/admin/*` routes they call (the slip-upload endpoint) all require this
  admin session — an unauthenticated page request redirects to `/admin/login`; an
  unauthenticated API request gets a 401 JSON response instead, since it's called
  via `fetch` from client code, not a page navigation. **Admin is hidden from
  general users, not merely gated**: the top nav shows no "Admin" (or "Upload")
  link at all to a signed-out visitor — a general user's nav is Ranking / View
  Slips / Rules only, and the only way to reach `/admin` is to already know the
  URL. The public-facing pages (Ranking, View Slips, Rules) are accessible without
  auth.

### 6.1 Pages

1. **Rules** (`/rules`) — renders §3 and §4 of this document (kept as structured
   content, e.g. MDX or a CMS-style table in the DB, so it can be edited without a
   redeploy).
2. **Upload** (`/admin/upload`, **admin-only, v1.5**) — the admin picks the player
   from the fixed dropdown, picks the bookmaker (or types a new one), and uploads
   the slip screenshot the player posted in WhatsApp. The app shows the
   AI-extracted fields for a quick eyeball-confirm before saving, with plain
   league and kick-off date/time fields per leg to fill in by hand (§3.12a). On
   successful save, the admin lands on that bet's Admin settlement page.
3. **View Slips** (`/bets`) — every uploaded slip, browsable by player, each opening
   to a read-only view of that slip (image + extracted legs, with the same red-flag
   badge as the confirm screen for any leg priced under evens). Public, no auth —
   this is where a general user checks what's been recorded so far; no edit/upload
   controls are shown here (those are admin-only, under `/admin`).
4. **Ranking** (`/`) — the betc\*nt leaderboard: table of all 6 players sorted per
   §4 (highest betc\*nt count — most COTW's — first, ties broken by win\* count
   then Prediction Score, v1.8), plus a per-player detail view (bet history, win
   rate, current streak) and simple charts (betc\*nt count over time, legs-won
   distribution).
5. **Admin** (`/admin`, auth-required, **hidden from general users, v1.5**) —
   uploading a slip (see "Upload" above); full CRUD on bets/legs/players/
   bookmakers; **per-leg Won/Lost/Void controls to register results (§3.9a)** —
   for a Betfair-sourced leg this is a direct transcription of Betfair's own
   settlement, for any other bookmaker it's the plain full-time result — with the
   bet's overall status/winnings recomputing immediately once all three legs are
   Won/Lost; **a win\* checkbox on Betfair legs (v1.8, §3.8/§3.9a)**, shown when
   registering a Betfair leg as Won, for the admin to flag whether it only won via
   the 90-minute rule; **a Void-leg reconciliation control (§3.7a)** that appears
   whenever a bet has a Void leg, letting the admin either void the whole bet (full
   refund, excluded from scoring) or type in the bookmaker's recalculated return;
   **amend any bet-level or covered leg field — including on an already-settled
   bet (§6.3, v1.9)** — with the settlement figures re-derived automatically when
   a correction affects them; **delete a bet slip entirely, singly or as a batch
   (§6.3, v1.9)**; every change (amend, single delete, or batch delete) writes to
   an audit trail (`admin_audit_log`); view raw AI extraction JSON alongside the
   slip image side-by-side for corrections; manage the fixed player and
   bookmaker lists.

### 6.2 Non-functional requirements

- **Auditability**: every admin change to a bet/leg after initial creation is logged
  (old value, new value, timestamp) in `admin_audit_log`, including leg
  Won/Lost/Void registrations, a §3.7a void-bet reconciliation choice, any later
  correction to either, any field amendment (§6.3), and a full JSON snapshot taken
  immediately before a bet is deleted (§6.3).
- **Idempotency**: re-registering a leg's result overwrites its previous status and
  immediately recomputes the bet's derived status/winnings (unless a void leg
  requires the §3.7a reconciliation instead) — corrections are cheap and always
  reflect the latest admin entry, no stale derived state. Re-running the §3.7a
  reconciliation likewise overwrites the previous choice.
- **Image handling**: slip screenshots stored in Supabase Storage, private bucket,
  signed URLs only; retained indefinitely (small volume — one per week), except
  where a bet is deleted (§6.3), which also removes its slip image.
- **Error handling**: if AI extraction fails or returns low-confidence/incomplete
  data, the bet is saved as `pending_review` with whatever fields were extracted,
  flagged for admin attention rather than silently dropped.
- **Mobile optimisation**: the app must be fully usable on mobile screens — this is
  not a "nice to have," since the admin will realistically upload slips and settle
  bets from their phone, and players will check the ranking from theirs, far more
  often than from a desktop. Concretely:
  - The header navigation must **collapse to a hamburger/menu icon below the `sm`
    breakpoint** (~640px), opening either a dropdown or a slide-in panel listing
    whichever nav items apply to the current visitor (Ranking / View Slips / Rules
    for everyone, plus Admin only when signed in — §6, v1.5), rather than wrapping
    nav links onto multiple cramped lines next to the logo.
  - All pages (Ranking table, Upload flow, Rules, Admin) must be laid out
    responsively — tables that would overflow a phone width scroll horizontally
    within their own container rather than breaking the page layout; forms and
    buttons are touch-sized (minimum ~44px tap targets); no fixed-width layouts
    that force horizontal scrolling of the whole page. This includes the per-leg
    Won/Lost/Void controls, the §3.7a void-reconciliation control, and the §6.3
    delete confirmation in Admin — usable as thumb-sized tap targets, not cramped
    dropdowns.
  - The admin Upload page in particular should support picking a photo directly
    from the phone's camera/gallery (a plain
    `<input type="file" accept="image/*" capture>` covers this without extra
    libraries), since that's the primary real-world upload path.
  - Treat mobile as the primary target and desktop as the secondary, wider
    breakpoint — design mobile-first and expand up, rather than the reverse.

### 6.3 Admin: amending and deleting bet slips

The admin has full corrective and destructive control over what's already been
recorded, beyond the settlement-specific corrections already described in §3.7a/
§3.9a/§3.12a:

- **Amend (v1.9 — implemented).** From a bet's Admin settlement page, an "Edit
  details" link opens the amend screen — the same confirm/edit screen used right
  after upload (`/admin/upload/confirm/[id]`), reused rather than duplicated. The
  admin can correct any bet-level field (player, bookmaker, bet date, stake, the
  slip's stated return amount, admin notes) and any leg field this screen covers
  (league, home/away team, kick-off date/time, predicted outcome, odds).
  Settlement-owned fields — Won/Lost/Void status, settlement notes, full-time
  score, and the win\* 90-minute-rule flag — stay the dedicated Settle screen's
  job (§3.9a) and are left untouched by an amend save.
  - **Works the same on an already-settled bet as on a pending one.** This is
    deliberate: a slip recorded against the wrong player, or a mistyped stake, is
    just as likely to surface after settlement as before it. The amend screen
    shows a banner naming the bet's current status when it's already Won/Lost/
    Void, and saving there doesn't reset or require re-doing that settlement.
  - **Every changed field is logged** to `admin_audit_log` (old value, new value,
    timestamp) — one entry summarising whatever bet-level fields changed, and one
    per leg that changed, so a correction after the fact is exactly as auditable
    as the original entry.
  - **If the correction touches a figure the settlement roll-up depends on** (the
    slip's stated return amount — stake itself doesn't feed it, §3.7) and the bet
    already has all three legs Won/Lost with no Void present, the bet's
    `status`/`winnings`/win\* are **re-derived automatically** from the corrected
    figure using the same logic the Settle screen uses (§3.7, §4) — so the
    betc\*nt rankings reflect the fix immediately, with no separate recalculate
    step. A bet with a Void leg is left alone here regardless of what changed —
    that stays the §3.7a reconciliation control's job, never this screen's.
- **Delete.** The admin can remove a bet slip entirely — its bet row and all three
  leg rows — for cases like a duplicate upload, a slip recorded against the wrong
  player, or a test/mistaken entry. This is a deliberately destructive, admin-only
  action:
  - It requires an explicit confirmation step in the UI — no single-click delete.
  - Immediately before the row is removed, the full bet and its legs are
    snapshotted as JSON into `admin_audit_log` (`entity_type = 'bet'`,
    `field_changed = 'deleted'`, `old_value` = the JSON snapshot,
    `new_value = null`), so there's a permanent record of exactly what existed
    even though the live row is gone.
  - `bet_legs` rows for that bet cascade-delete automatically
    (`on delete cascade`, already in §5's schema) — no separate leg-deletion step.
  - The associated slip image in Supabase Storage is deleted at the same time
    (best-effort — a failure here is logged, not blocking, since a leftover
    image file is a tidiness issue, not a correctness one).
  - Once deleted, the bet stops appearing anywhere it was previously shown — View
    Slips, Admin, and the betc\*nt rankings — immediately and without any separate
    recompute step, since the ranking view is always derived live from whichever
    `bets`/`bet_legs` rows currently exist (§5).
  - There is no built-in "undo" beyond the admin manually re-entering the bet from
    the audit-log snapshot if a delete turns out to be a mistake. Acceptable for a
    small private app with a single trusted admin, but worth being explicit that
    v1 has no soft-delete/recycle-bin.
  - **Batch delete (v1.9 — implemented).** All Bets (`/admin/bets`) has a
    checkbox per row plus a "select all" and a "Delete selected" control, so
    several slips can be removed in one confirmed action rather than one at a
    time — useful for clearing out a run of test/duplicate uploads. Each selected
    bet still goes through exactly the same steps as a single delete (its own
    audit-log snapshot first, then best-effort image removal, then the row) —
    batching only saves the admin repeated confirm clicks, it doesn't skip any of
    the single-delete safeguards. If one bet in a batch fails to delete (a race
    with something else, a transient DB error), the rest of the batch still
    completes and the admin is told how many succeeded versus failed, rather than
    the whole batch silently aborting.

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
- No player login/accounts in v1 — players never sign in to the app at all
  (§6, v1.5); they post their slip screenshot in WhatsApp and the admin does
  everything upload-related. Acceptable for a private friend-group app; can be
  revisited if the WhatsApp-relay workflow becomes a bottleneck.
- **No automated fixture lookup or automated result settlement in v1** — both an
  API-based approach (API-Football) and a scraping-based approach were evaluated
  and parked (see the v1.1 changelog, §3.9, §3.12). Kick-off date/time is typed in
  by hand (§3.12a), and leg results are registered by the admin as Won/Lost/Void
  (§3.9a). The Betfair 90-minute rule (§3.8) applies only to Betfair-sourced legs,
  and requires no judgement call from the admin — Betfair's own site already
  settles each leg with that rule applied, so the admin just transcribes Betfair's
  settled status into the app; every other bookmaker's legs are settled on the
  plain full-time result. This can be revisited if a paid data feed is adopted
  later.
- **No automatic handling of Void legs** — a Void leg always requires the admin to
  explicitly reconcile the whole bet by hand (§3.7a): void the bet entirely (full
  refund, excluded from scoring) or enter the bookmaker's own recalculated return.
  The app never guesses at a recalculated return itself.
- **No soft-delete/recycle-bin for bet slips** — deleting a bet (§6.3) is permanent
  from the app's point of view, recoverable only by the admin manually re-entering
  it from the `admin_audit_log` snapshot taken at delete time. Acceptable given a
  single trusted admin; can be revisited if that ever proves risky in practice.
- Single "season" — no season resets/archiving in v1; all-time totals. Can add season
  boundaries later if wanted.
