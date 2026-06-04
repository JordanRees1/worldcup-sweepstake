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
} from './types';

export const API_BASE = '/api';

/** Canonical, versionless route paths. */
export const API_ROUTES = {
  health: '/api/health',
  overview: '/api/overview',
  players: '/api/players',
  player: (id: number | ':id') => `/api/players/${id}`,
  teams: '/api/teams',
  groups: '/api/groups',
  bracket: '/api/bracket',
  matches: '/api/matches',
  schedule: '/api/schedule',
} as const;

export interface HealthResponse {
  ok: boolean;
  dataSource: DataSource;
  /** ISO timestamp of the last results refresh, or null in seed mode. */
  lastUpdated: string | null;
  version: string;
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
