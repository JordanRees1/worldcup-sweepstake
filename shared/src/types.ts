// Canonical domain model for the World Cup 2026 sweepstake.
//
// This is the SINGLE SOURCE OF TRUTH for both `server` and `web`. Never redefine these
// shapes in another workspace — import them from `@sweepstake/shared`.
//
// The structural fields come from `datasets/*.csv`; the dynamic fields (`result`, `status`,
// standings, leaderboard) are computed by the server's engine and only ever READ by the web.

export type GroupLetter =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L';

/** The seven 2026 stages, in tournament order. */
export const STAGE_NAMES = [
  'Group Stage',
  'Round of 32',
  'Round of 16',
  'Quarterfinals',
  'Semifinals',
  'Third Place Playoff',
  'Final',
] as const;
export type StageName = (typeof STAGE_NAMES)[number];

export interface Stage {
  id: number;
  name: StageName;
  order: number;
}

export interface Venue {
  id: number;
  city: string;
  country: string;
  venue: string;
  regionCluster: 'East' | 'Central' | 'West';
  airportCode: string;
}

/** A national team, or an as-yet-unresolved playoff slot (`isPlaceholder`). */
export interface Team {
  id: number;
  /** Canonical/official name, e.g. "Côte d'Ivoire". */
  name: string;
  /** 3-letter FIFA code, e.g. "CIV". */
  fifaCode: string;
  group: GroupLetter | null;
  /** True for a playoff-winner slot that is not yet a real team. */
  isPlaceholder: boolean;
  /** e.g. "Winner UEFA Playoff D" (placeholders only). */
  placeholderLabel?: string;
  /** Crest image URL, when supplied by the live API. */
  crestUrl?: string;
}

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed';

export interface MatchResult {
  homeScore: number;
  awayScore: number;
  homePenalties?: number;
  awayPenalties?: number;
  /** Resolved winner (knockout ties always have one). */
  winnerTeamId?: number | null;
}

export interface Match {
  id: number;
  matchNumber: number;
  stage: StageName;
  stageOrder: number;
  /** Group-stage matches only. */
  group?: GroupLetter;
  /** Raw label from the dataset, e.g. "Group A", "1C vs 2F", "W73 vs W75". */
  label: string;
  /** ISO 8601 with timezone offset. */
  kickoffAt: string;
  venueId: number;
  /** Null until a knockout slot resolves to a real team. */
  homeTeamId: number | null;
  awayTeamId: number | null;
  status: MatchStatus;
  result?: MatchResult;
  /** Live match clock in minutes — present only while `status === 'live'` (when the API provides it). */
  minute?: number;
}

export interface GroupStandingRow {
  teamId: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** 1..4 within the group. */
  rank: number;
}

export interface GroupTable {
  group: GroupLetter;
  rows: GroupStandingRow[];
  /** True while a match in this group is in play — the table reflects provisional live scores. */
  live?: boolean;
}

/** Where a team's run currently stands. */
export type TeamOutcome =
  | 'upcoming' // tournament/team not started, or an unresolved placeholder
  | 'alive' // still in
  | 'eliminated' // knocked out
  | 'champion' // won the Final
  | 'did_not_qualify'; // playoff pick / placeholder that never became a real entrant

export interface TeamStatus {
  teamId: number;
  outcome: TeamOutcome;
  alive: boolean;
  furthestStage: StageName | 'Did Not Qualify';
  eliminatedAtStage?: StageName;
  /** The team's next match, if it has one. */
  nextMatchId?: number;
}

export interface Player {
  id: number;
  name: string;
}

/** A player's pick after normalization against the canonical team list. */
export interface Pick {
  playerId: number;
  /** Null when the raw name could not be matched to a canonical team. */
  teamId: number | null;
  /** Original text from player_picks.csv. */
  rawName: string;
  matched: boolean;
  /** e.g. "typo: Sengal", "variant: Ivory Coast", "playoff-contingent". */
  note?: string;
}

export interface PlayerTeam {
  team: Team;
  status: TeamStatus;
}

export interface PlayerSummary {
  player: Player;
  rank: number;
  aliveCount: number;
  furthestStage: StageName | 'Did Not Qualify';
  points: number;
  /** Separate tracked metric: sum of this player's teams' goal differences. */
  goalDifference: number;
  teams: PlayerTeam[];
}

export type DataSource = 'seed' | 'live';
