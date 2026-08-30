-- Adds the two domestic cup competitions (FA Cup, EFL Cup / Carabao Cup) as
-- valid values on bet_legs.league, per CJ's request (30 Aug 2026, session 4):
-- previously the league_code enum only covered the four English divisions
-- (PL, CHAMPIONSHIP, LEAGUE_ONE, LEAGUE_TWO), so a cup-tie leg had no valid
-- value to be saved with -- the admin's league dropdown, the AI extraction
-- prompt, and this enum are updated together (see bet-schema.ts,
-- extract-bet.ts, and the LEAGUE_LABELS maps in the three pages that render
-- a league value).
--
-- Postgres requires ALTER TYPE ... ADD VALUE to run outside of, or as the
-- only statement in, a transaction that also uses the new value -- this file
-- only adds the values and never uses them, so it's safe to run as-is in the
-- Supabase SQL editor.

alter type league_code add value if not exists 'FA_CUP';
alter type league_code add value if not exists 'EFL_CUP';
