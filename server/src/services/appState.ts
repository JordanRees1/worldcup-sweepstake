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
import { loadTenantDataset, type Dataset, type StructuralData } from '../data/dataset';
import { resolveSweepstakeByCode } from '../data/sweepstake';
import {
  buildLeaderboard,
  computeAllGroupStandings,
  computeDecidedGroups,
  computeQualification,
  computeTeamGoalDifferences,
  computeTeamScores,
  computeTeamStatuses,
} from '../engine';
import type { ProviderMeta, ResultsProvider } from '../providers';
import { applyResults } from './applyResults';

/** Everything the routes need for one sweepstake, computed from the canonical data + results. */
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
  /** Identity of the sweepstake (tenant) this state was computed for. */
  sweepstake: { code: string; name: string; teamsPerPlayer: number };
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
  const teamScores = computeTeamScores(matches);
  const leaderboard = buildLeaderboard(
    dataset.players,
    dataset.picks,
    dataset.teams,
    teamStatuses,
    teamGDs,
    teamScores,
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
    sweepstake: {
      code: dataset.sweepstake.code,
      name: dataset.sweepstake.name,
      teamsPerPlayer: dataset.sweepstake.teamsPerPlayer,
    },
  };
}

export interface AppStateService {
  get(): Promise<AppState>;
}

/**
 * Single-sweepstake state service (legacy / tests). Memoizes for `ttlMs` and coalesces
 * concurrent computations. The multi-tenant server uses {@link createGateway} instead.
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

/** Multi-tenant gateway: resolves a sweepstake by code and computes its state on demand. */
export interface Gateway {
  /** Per-code app state, or null if no sweepstake has that code. */
  get(code: string): Promise<AppState | null>;
  /** Provider meta for the global /health route. */
  meta(): ProviderMeta;
}

/**
 * One server hosting many sweepstakes. All tenants share the single `provider` (so the upstream
 * results fetch happens once, cached); each tenant's state is computed from the shared tournament
 * structure + that tenant's picks, and memoized per code for `ttlMs`.
 */
export function createGateway(
  structural: StructuralData,
  provider: ResultsProvider,
  ttlMs: number,
): Gateway {
  const cache = new Map<string, { state: AppState; at: number }>();
  const inflight = new Map<string, Promise<AppState>>();

  return {
    async get(code: string): Promise<AppState | null> {
      const sweepstake = resolveSweepstakeByCode(code);
      if (!sweepstake) return null;
      const key = sweepstake.code;

      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.state;

      let pending = inflight.get(key);
      if (!pending) {
        pending = computeAppState(loadTenantDataset(structural, sweepstake), provider)
          .then((state) => {
            cache.set(key, { state, at: Date.now() });
            inflight.delete(key);
            return state;
          })
          .catch((err: unknown) => {
            inflight.delete(key);
            const stale = cache.get(key);
            if (stale) return stale.state; // serve stale on failure
            throw err;
          });
        inflight.set(key, pending);
      }
      return pending;
    },
    meta(): ProviderMeta {
      return provider.meta();
    },
  };
}
