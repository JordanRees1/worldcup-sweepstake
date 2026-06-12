// The REST contract between `server` and `web`. Endpoint paths plus request/response shapes.
//
// WP0 implements only `GET /api/health`. The other shapes are the agreed contract that
// later work packages (WP4 server, WP6/WP7 web) build against — defining them now is what
// lets those workstreams proceed in parallel.

import type {
  DataSource,
  GroupTable,
  Match,
  PlayerSummary,
  Team,
  TeamStatus,
  Venue,
} from './types';

export const API_BASE = '/api';

/**
 * Canonical route paths. `health` is global; the rest are scoped to a sweepstake `code`
 * (`/api/s/<code>/…`) so one server hosts many sweepstakes (the multi-tenant gateway).
 */
export const API_ROUTES = {
  health: '/api/health',
  meta: (code: string) => `/api/s/${code}/meta`,
  overview: (code: string) => `/api/s/${code}/overview`,
  players: (code: string) => `/api/s/${code}/players`,
  player: (code: string, id: number | ':id') => `/api/s/${code}/players/${id}`,
  teams: (code: string) => `/api/s/${code}/teams`,
  venues: (code: string) => `/api/s/${code}/venues`,
  groups: (code: string) => `/api/s/${code}/groups`,
  bracket: (code: string) => `/api/s/${code}/bracket`,
  matches: (code: string) => `/api/s/${code}/matches`,
  schedule: (code: string) => `/api/s/${code}/schedule`,
} as const;

export interface HealthResponse {
  ok: boolean;
  dataSource: DataSource;
  /** ISO timestamp of the last results refresh, or null in seed mode. */
  lastUpdated: string | null;
  version: string;
}

/** Lightweight tenant identity — used to validate a code + label saved sweepstakes. */
export interface MetaResponse {
  code: string;
  name: string;
  teamsPerPlayer: number;
  playerCount: number;
}

export interface OverviewResponse {
  asOf: string;
  dataSource: DataSource;
  currentStage: string;
  /** Players sorted into leaderboard order. */
  leaderboard: PlayerSummary[];
}

export interface PlayersResponse {
  players: PlayerSummary[];
}

export interface PlayerDetailResponse {
  player: PlayerSummary;
  fixtures: Match[];
}

export interface TeamsResponse {
  teams: Array<{ team: Team; status: TeamStatus }>;
}

export interface VenuesResponse {
  venues: Venue[];
}

export interface GroupsResponse {
  groups: GroupTable[];
}

export interface BracketNode {
  matchId: number;
  stage: string;
  label: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  winnerTeamId: number | null;
}

export interface BracketResponse {
  rounds: Array<{ stage: string; nodes: BracketNode[] }>;
}

export interface MatchesResponse {
  matches: Match[];
}

export interface ScheduleResponse {
  days: Array<{ date: string; matches: Match[] }>;
}

/** Uniform error envelope returned by every endpoint on failure. */
export interface ApiError {
  error: { code: string; message: string };
}
