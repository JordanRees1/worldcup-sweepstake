// The REST contract between `server` and `web`. Endpoint paths plus request/response shapes.
//
// WP0 implements only `GET /api/health`. The other shapes are the agreed contract that
// later work packages (WP4 server, WP6/WP7 web) build against — defining them now is what
// lets those workstreams proceed in parallel.

import type {
  DataSource,
  GroupLetter,
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
  // Create / validate / edit / delete (multi-tenant self-service).
  createSweepstake: '/api/sweepstakes',
  validateSweepstake: '/api/sweepstakes/validate',
  sweepstake: (code: string) => `/api/s/${code}`,
  // Admin (global ADMIN_TOKEN gated).
  admin: '/api/a/admin',
  adminCreationPassword: '/api/a/admin/creation-password',
} as const;

/**
 * How a generated draw spreads teams across players (by FIFA ranking):
 * - `chaos`: fully random.
 * - `pots`: split the 48 teams into N ranking tiers and give each player one team per tier.
 * - `halves`: split into the top 24 and bottom 24, giving each player as even a mix as possible.
 */
export type GenerateMode = 'chaos' | 'pots' | 'halves';

/** Roster submitted to create/edit a sweepstake (picks are team names; the server resolves them). */
export interface SweepstakeInput {
  name: string;
  teamsPerPlayer: number;
  /** Player rows. When `generate` is set, only the names are used — `picks` may be empty. */
  players: { name: string; picks: string[] }[];
  /** Ask the server to draw the teams for you; ignores `players[].picks`. */
  generate?: { mode: GenerateMode };
}

/** A pick that didn't resolve, with a "did you mean…?" suggestion when one is close. */
export interface PickIssue {
  player: string;
  rawName: string;
  suggestion?: string;
}

export interface ValidateResponse {
  ok: boolean;
  issues?: PickIssue[];
  errors?: string[];
}

export interface CreateResponse {
  /** The new sweepstake's short code (its URL is /s/<code>). */
  code: string;
  /** Owner token — shown once; needed to edit/delete this sweepstake later. */
  ownerToken: string;
  /** The drawn assignment (present only for generated sweepstakes — reveals who got which teams). */
  roster?: { name: string; teams: string[] }[];
}

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
  /** True when a match is in play — points/GD include provisional live scores. */
  provisional?: boolean;
}

export interface PlayersResponse {
  players: PlayerSummary[];
  /** True when a match is in play — points/GD include provisional live scores. */
  provisional?: boolean;
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

/** One row of the "best third-placed teams" ranking shown under the group tables. */
export interface ThirdPlaceRow {
  teamId: number;
  group: GroupLetter;
  /** 1–12 across all groups' current 3rd-placed teams. */
  rank: number;
  /** Currently inside the top 8 (would qualify for the Round of 32). */
  qualifying: boolean;
  played: number;
  points: number;
  goalDifference: number;
  goalsFor: number;
}

export interface GroupsResponse {
  groups: GroupTable[];
  /** All 12 groups' 3rd-placed teams ranked; the top 8 qualify. Omitted before any group game. */
  thirdPlace?: ThirdPlaceRow[];
}

export interface BracketNode {
  matchId: number;
  stage: string;
  label: string;
  homeTeamId: number | null;
  awayTeamId: number | null;
  winnerTeamId: number | null;
  /** The home team is an "as it stands" R32 projection, not yet a confirmed participant. */
  homeProvisional?: boolean;
  awayProvisional?: boolean;
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

/** One row in the admin panel — a sweepstake plus best-effort usage signals. */
export interface AdminSweepstake {
  code: string;
  name: string;
  /** `baked` = committed dataset (aa26/crackers, read-only); `custom` = runtime store (editable). */
  kind: 'baked' | 'custom';
  teamsPerPlayer: number;
  playerCount: number;
  /** ISO creation time (custom only; null for baked sweepstakes). */
  createdAt: string | null;
  /** Page loads seen this server lifetime (best-effort, per-replica). */
  views: number;
  /** Distinct anonymous clients in the last ~5 min (best-effort, per-replica). */
  activeNow: number;
}

export interface AdminResponse {
  totals: { sweepstakes: number; players: number };
  /** Human note on metric accuracy (per-replica / reset on restart). */
  metricsNote: string;
  sweepstakes: AdminSweepstake[];
  /** True when creation needs no password (dev / no CREATE_TOKEN configured). */
  creationOpen: boolean;
  /** The current one-time creation password — present only when creation is gated. */
  creationPassword?: string;
}

/** Response from rotating the creation password (admin only). */
export interface CreationPasswordResponse {
  creationPassword?: string;
  creationOpen?: boolean;
}

/** Uniform error envelope returned by every endpoint on failure. */
export interface ApiError {
  error: { code: string; message: string };
}
