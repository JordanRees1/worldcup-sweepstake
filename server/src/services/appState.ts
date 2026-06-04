import type {
  DataSource,
  GroupTable,
  Match,
  Pick,
  Player,
  PlayerSummary,
  Team,
  TeamStatus,
  Venue,
} from '@sweepstake/shared';
import type { Dataset } from '../data/dataset';
import {
  buildLeaderboard,
  computeAllGroupStandings,
  computeDecidedGroups,
  computeQualification,
  computeTeamGoalDifferences,
  computeTeamStatuses,
} from '../engine';
import type { ResultsProvider } from '../providers';
import { applyResults } from './applyResults';

/** Everything the routes need, computed from the canonical data + current results. */
export interface AppState {
  teams: Team[];
  venues: Venue[];
  players: Player[];
  picks: Pick[];
  matches: Match[];
  groupTables: GroupTable[];
  teamStatuses: Map<number, TeamStatus>;
  leaderboard: PlayerSummary[];
  dataSource: DataSource;
  lastUpdated: string | null;
}

/** Run the full pipeline: provider results → hydrate matches → engine → app state. */
export async function computeAppState(
  dataset: Dataset,
  provider: ResultsProvider,
): Promise<AppState> {
  const [results, slots] = await Promise.all([provider.getResults(), provider.getResolvedSlots()]);
  const matches = applyResults(dataset.matches, results, slots);

  const groupTables = computeAllGroupStandings(dataset.teams, matches);
  const decidedGroups = computeDecidedGroups(matches);
  const qualification = computeQualification(groupTables, decidedGroups);
  const teamStatuses = computeTeamStatuses(
    dataset.teams,
    matches,
    groupTables,
    decidedGroups,
    qualification,
  );
  const teamGDs = computeTeamGoalDifferences(matches);
  const leaderboard = buildLeaderboard(
    dataset.players,
    dataset.picks,
    dataset.teams,
    teamStatuses,
    teamGDs,
  );

  const meta = provider.meta();
  return {
    teams: dataset.teams,
    venues: dataset.venues,
    players: dataset.players,
    picks: dataset.picks,
    matches,
    groupTables,
    teamStatuses,
    leaderboard,
    dataSource: meta.source,
    lastUpdated: meta.lastUpdated,
  };
}

export interface AppStateService {
  get(): Promise<AppState>;
}

/**
 * Memoizes the computed app state for `ttlMs` and shares a single in-flight computation
 * across concurrent requests. The provider also caches its HTTP fetch, so this layer mostly
 * avoids re-running the (cheap) engine on bursts of requests.
 */
export function createAppStateService(
  dataset: Dataset,
  provider: ResultsProvider,
  ttlMs: number,
): AppStateService {
  let cache: { state: AppState; at: number } | null = null;
  let inflight: Promise<AppState> | null = null;

  return {
    async get(): Promise<AppState> {
      if (cache && Date.now() - cache.at < ttlMs) return cache.state;
      inflight ??= computeAppState(dataset, provider)
        .then((state) => {
          cache = { state, at: Date.now() };
          inflight = null;
          return state;
        })
        .catch((err: unknown) => {
          inflight = null;
          if (cache) return cache.state; // serve stale on failure
          throw err;
        });
      return inflight;
    },
  };
}
