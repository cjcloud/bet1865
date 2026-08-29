# Bet1865 — agent instructions

Before making any change to this codebase, read `SPEC.md` (project specification —
game rules, scoring, data model, architecture, branding) and
`BUILD_TEST_DEPLOY_PLAN.md` (phased build/test/deploy plan) in this repo root. They
are the source of truth; conform to them. If a change requires deviating from
either document, update the document in the same change so it stays authoritative.

Key non-negotiables to keep front of mind:
- Legs are intended to be priced at 2.00 (Evens) or better, but never rejected for
  breaking that — a leg under 2.00 is recorded as-is and red-flagged
  (`below_minimum_odds`), never blocked or silently dropped — see SPEC.md §3.10.
- Settlement winnings: any losing leg -> £0; all three legs win -> the slip's
  stated return amount (not recalculated from odds) — see SPEC.md §3.7. Automated
  result lookup/settlement (API-Football, scraping) is parked for v1 — the admin
  registers each leg's Won/Lost/Void by hand in Admin (§3.9a), and the roll-up
  (plus the required §3.7a void-leg reconciliation) is an isolated, unit-tested
  pure function (`src/lib/settlement.ts`), not a scheduled job.
- The Betfair 90-minute rule (§3.8) is applied by Betfair's own site before the
  admin ever sees it — the admin just transcribes Betfair's settled Won/Lost into
  Bet1865 (§3.9a). There is no in-app goal-event reconstruction to build or test.
- betc*nt scoring (primary "betc*nt count"/secondary "Prediction Score") — see
  SPEC.md §4, with a worked example. The Ranking page sorts highest betc*nt count
  first (most COTW's at the top), Prediction Score breaking a tie.
- Admin (upload, settle, correct bets) is hidden from general users, not just
  auth-gated — no nav link is shown to a signed-out visitor at all (see
  `src/app/layout.tsx`), and both `/admin/*` pages and the `/api/admin/*` routes
  they call require the single pre-created admin account (magic link) —
  see SPEC.md §6. Players never upload their own slip; they post it on WhatsApp
  and the admin uploads it via `/admin/upload`. General users can only view
  Ranking, View Slips, and Rules.
- Mobile is the primary target, not an afterthought: nav collapses to a
  hamburger below the `sm` breakpoint, tables scroll within their own container
  rather than the page, forms are touch-sized -- see SPEC.md §6.2.
