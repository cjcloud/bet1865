# Bet1865 — agent instructions

Before making any change to this codebase, read `SPEC.md` (project specification —
game rules, scoring, data model, architecture, branding) and
`BUILD_TEST_DEPLOY_PLAN.md` (phased build/test/deploy plan) in this repo root. They
are the source of truth; conform to them. If a change requires deviating from
either document, update the document in the same change so it stays authoritative.

Key non-negotiables to keep front of mind:
- Odds per leg must be >= 2.00 (Evens or better) — see SPEC.md §3.
- Settlement winnings: any losing leg -> £0; all three legs win -> the slip's
  stated return amount (not recalculated from odds) — see SPEC.md §3.7.
- The Betfair 90-minute settlement rule is a deterministic goal-event algorithm,
  not real-time/in-play polling — see SPEC.md §3.9 for the exact logic and worked
  examples, and keep it implemented as an isolated, unit-tested pure function.
- betc*nt scoring (primary/secondary) — see SPEC.md §4, with a worked example.
- Players have no login; only the Admin route is authenticated — see SPEC.md §6.
- Mobile is the primary target, not an afterthought: nav collapses to a
  hamburger below the `sm` breakpoint, tables scroll within their own container
  rather than the page, forms are touch-sized -- see SPEC.md §6.2.
