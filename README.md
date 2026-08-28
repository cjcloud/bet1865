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

## Admin auth (one-time setup)

The Admin area (`/admin/*`) uses Supabase magic-link sign-in, restricted to a single
pre-created admin user:

1. In Supabase: **Authentication → Users → Add user**, enter your admin email
   (auto-confirm it, no password needed).
2. In Supabase: **Authentication → Sign In / Providers** (or **Auth → Settings**,
   naming varies by dashboard version), turn **off** "Allow new user signups" — this
   ensures `signInWithOtp` only issues a magic link to the user you just created,
   not to anyone who types an email into the login form.
3. Visit `/admin/login`, enter that email, and follow the link sent to your inbox.
