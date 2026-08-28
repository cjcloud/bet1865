# Bet1865

Weekly treble-bet tracker and "betc\*nt" league table for a 6-player betting group.

See `SPEC.md` for the full project specification and `BUILD_TEST_DEPLOY_PLAN.md` for
the phased build/test/deploy plan. Agents/contributors: read `CLAUDE.md` first.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in Supabase/Anthropic/RapidAPI keys
npm run dev
```

## Database

Schema lives in `supabase/migrations/0001_init.sql`, seed data in
`supabase/seed.sql`. Apply via the Supabase CLI or SQL editor.
