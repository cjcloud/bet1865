// Client for api-football.com's direct dashboard API (NOT the RapidAPI
// marketplace listing — different host/header). SPEC.md §3.12.
//
// NOT YET LIVE-TESTED: built from api-football.com's own published example
// request and endpoint descriptions, since we don't have a live key in this
// session to verify against. If fixture lookup errors or returns nothing
// unexpectedly, the raw API response is surfaced (see callers) rather than
// swallowed, so a parameter/shape mismatch is easy to spot and fix.

const BASE_URL = "https://v3.football.api-sports.io";

function apiKey(): string {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error(
      "API_FOOTBALL_KEY is not set. Add your api-football.com dashboard API key as an environment variable."
    );
  }
  return key;
}

async function apiFootballGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": apiKey() },
    // Fixture data for a given date range doesn't change second-to-second;
    // avoid burning free-tier quota on identical repeat searches.
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API-Football ${path} returned ${res.status}: ${body.slice(0, 500)}`);
  }

  const json = (await res.json()) as { errors?: unknown; response?: unknown };
  if (json.errors && Array.isArray(json.errors) ? json.errors.length > 0 : !!json.errors) {
    throw new Error(`API-Football ${path} error: ${JSON.stringify(json.errors)}`);
  }
  return json as T;
}

// The four pyramid divisions (valid bet legs per SPEC.md §3 point 2) plus the
// two domestic cups — included in fixture SEARCH scope only, per §3.12, so
// two same-week fixtures between the same teams (a league game and a cup
// tie) can be told apart. A cup fixture has no matching `league_code`.
export const COMPETITIONS = [
  { slug: "PL", label: "Premier League", searchTerm: "Premier League", type: "League", leagueCode: "PL" },
  { slug: "CHAMPIONSHIP", label: "Championship", searchTerm: "Championship", type: "League", leagueCode: "CHAMPIONSHIP" },
  { slug: "LEAGUE_ONE", label: "League One", searchTerm: "League 1", type: "League", leagueCode: "LEAGUE_ONE" },
  { slug: "LEAGUE_TWO", label: "League Two", searchTerm: "League 2", type: "League", leagueCode: "LEAGUE_TWO" },
  { slug: "FA_CUP", label: "FA Cup", searchTerm: "FA Cup", type: "Cup", leagueCode: null },
  { slug: "EFL_CUP", label: "EFL Cup (Carabao Cup)", searchTerm: "EFL Cup", type: "Cup", leagueCode: null },
] as const;

export type CompetitionSlug = (typeof COMPETITIONS)[number]["slug"];

type LeagueSearchResponse = {
  response: Array<{
    league: { id: number; name: string; type: string };
    country: { name: string };
    seasons: Array<{ year: number; current: boolean }>;
  }>;
};

// Resolved fresh on every call rather than hardcoded/cached: league ids are
// not something we've been able to verify against a live account in this
// session, so name-based resolution (the API's own /leagues search) is
// safer than a possibly-wrong guessed numeric id.
async function resolveLeague(
  competition: (typeof COMPETITIONS)[number]
): Promise<{ id: number; season: number } | null> {
  // NOTE: API-Football's /leagues endpoint rejects `search` combined with
  // `country` ("The Country field cannot be used with the Search field."),
  // so country filtering happens client-side on the search results instead.
  const data = await apiFootballGet<LeagueSearchResponse>("/leagues", {
    search: competition.searchTerm,
  });

  const english = data.response.filter((r) => r.country.name.toLowerCase() === "england");
  const pool = english.length ? english : data.response;

  const match = pool.find(
    (r) => r.league.type.toLowerCase() === competition.type.toLowerCase()
  ) ?? pool[0];
  if (!match) return null;

  const currentSeason = match.seasons.find((s) => s.current) ?? match.seasons[match.seasons.length - 1];
  if (!currentSeason) return null;

  return { id: match.league.id, season: currentSeason.year };
}

type TeamSearchResponse = {
  response: Array<{ team: { id: number; name: string }; venue?: { country?: string } }>;
};

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bafc\b|\bfc\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

async function searchTeamId(name: string): Promise<{ id: number; name: string } | null> {
  // Same /teams `search` + `country` combo restriction as /leagues (see
  // resolveLeague) — search alone, then prefer an exact normalized-name
  // match among the results rather than filtering by country server-side.
  const data = await apiFootballGet<TeamSearchResponse>("/teams", {
    search: name,
  });
  if (!data.response.length) return null;

  const target = normalizeTeamName(name);
  const exact = data.response.find((r) => normalizeTeamName(r.team.name) === target);
  const best = exact ?? data.response[0];
  return { id: best.team.id, name: best.team.name };
}

type FixturesResponse = {
  response: Array<{
    fixture: { id: number; date: string; venue: { name: string | null } };
    league: { id: number; name: string };
    teams: {
      home: { id: number; name: string };
      away: { id: number; name: string };
    };
  }>;
};

export type FixtureCandidate = {
  externalFixtureId: string;
  competitionSlug: CompetitionSlug | "OTHER";
  competitionLabel: string;
  homeTeam: string;
  awayTeam: string;
  kickoffIso: string;
  venue: string | null;
};

// English football seasons run Aug-May and API-Football's `season` param is
// the year the season STARTED in (e.g. the 2026-27 season is `season=2026`).
// A bet slip from Jan-Jun belongs to the season that started the previous
// calendar year.
function seasonForDate(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1; // 1-12
  return month >= 7 ? year : year - 1;
}

// SPEC.md §3.12: search window is the slip's bet date up to 7 days ahead
// (a slip is for near-term games — typically ~4 days out, max 7).
export async function findFixtureCandidates(params: {
  homeTeam: string;
  awayTeam: string;
  fromDate: string; // YYYY-MM-DD, inclusive
}): Promise<FixtureCandidate[]> {
  const from = new Date(params.fromDate + "T00:00:00Z");
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 7);

  const [homeTeamResolved, leagues] = await Promise.all([
    searchTeamId(params.homeTeam),
    Promise.all(COMPETITIONS.map((c) => resolveLeague(c).then((r) => ({ slug: c.slug, label: c.label, resolved: r })))),
  ]);

  if (!homeTeamResolved) {
    throw new Error(`Could not find a team called "${params.homeTeam}" via API-Football.`);
  }

  const allowedLeagueIds = new Map<number, { slug: CompetitionSlug; label: string }>();
  for (const l of leagues) {
    if (l.resolved) allowedLeagueIds.set(l.resolved.id, { slug: l.slug, label: l.label });
  }

  // NOTE: API-Football's /fixtures `from`/`to` range params require `league`
  // AND `season` to also be supplied ("The Season field is required."),
  // which doesn't fit a search spanning several competitions at once.
  // Fetching by `team` + `season` alone returns the team's whole-season
  // fixture list instead, which we then filter to the 7-day window and
  // opponent/league ourselves.
  const fixtures = await apiFootballGet<FixturesResponse>("/fixtures", {
    team: String(homeTeamResolved.id),
    season: String(seasonForDate(params.fromDate)),
  });

  const targetAway = normalizeTeamName(params.awayTeam);

  return fixtures.response
    .filter((f) => f.teams.home.id === homeTeamResolved.id)
    .filter((f) => normalizeTeamName(f.teams.away.name) === targetAway)
    .filter((f) => allowedLeagueIds.has(f.league.id))
    .filter((f) => {
      const kickoff = new Date(f.fixture.date);
      return kickoff >= from && kickoff <= to;
    })
    .map((f) => {
      const comp = allowedLeagueIds.get(f.league.id)!;
      return {
        externalFixtureId: String(f.fixture.id),
        competitionSlug: comp.slug,
        competitionLabel: comp.label,
        homeTeam: f.teams.home.name,
        awayTeam: f.teams.away.name,
        kickoffIso: f.fixture.date,
        venue: f.fixture.venue.name,
      };
    });
}

export function competitionLeagueCode(slug: CompetitionSlug | "OTHER"): string | null {
  return COMPETITIONS.find((c) => c.slug === slug)?.leagueCode ?? null;
}
