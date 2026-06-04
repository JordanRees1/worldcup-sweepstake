import type { DataSource, MatchStatus } from '@sweepstake/shared';

export interface MatchResultDTO {
  /** Our canonical match id (1–104). */
  matchId: number;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  /** Resolved winner team id, or null for draws / not yet known. */
  winnerTeamId: number | null;
}

/**
 * A knockout match whose home/away team slots have been resolved by the live API
 * (i.e., the previous rounds finished and the API now knows who plays whom).
 * The WP4 service layer uses these to hydrate our Match objects before handing
 * them to the engine.
 */
export interface ResolvedSlotDTO {
  /** Our canonical match id. */
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
}

export interface ProviderMeta {
  source: DataSource;
  lastUpdated: string | null;
}

export interface ResultsProvider {
  getResults(): Promise<MatchResultDTO[]>;
  /** Knockout slot resolutions (empty for seed). */
  getResolvedSlots(): Promise<ResolvedSlotDTO[]>;
  meta(): ProviderMeta;
}
