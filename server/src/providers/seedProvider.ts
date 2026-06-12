import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATASETS_DIR } from '../data/paths';
import type { MatchResultDTO, ProviderMeta, ResolvedSlotDTO, ResultsProvider } from './types';

// ── Scenario file format (matches what generateScenarios.ts produces) ─────────

interface ScenarioResult {
  matchId: number;
  homeScore: number;
  awayScore: number;
  winnerTeamId: number;
}

interface ScenarioSlot {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
}

/** A match currently in progress — running score + clock, no winner yet. */
interface ScenarioLive {
  matchId: number;
  homeScore: number;
  awayScore: number;
  minute: number;
}

interface ScenarioFile {
  name: string;
  description: string;
  results: ScenarioResult[];
  slots: ScenarioSlot[];
  /** Optional in-progress matches (for testing the live UI offline). */
  live?: ScenarioLive[];
}

function loadScenario(scenario: string): { results: MatchResultDTO[]; slots: ResolvedSlotDTO[] } | null {
  const path = join(DATASETS_DIR, 'scenarios', `${scenario}.json`);
  if (!existsSync(path)) {
    console.warn(
      `[seedProvider] SEED_SCENARIO="${scenario}" but ${path} not found. ` +
        'Run `npm run generate:scenarios` to build scenario files.',
    );
    return null;
  }

  const file = JSON.parse(readFileSync(path, 'utf8')) as ScenarioFile;
  const live = file.live ?? [];
  console.log(
    `[seedProvider] Loaded scenario "${file.name}" ` +
      `(${file.results.length} results, ${file.slots.length} slots, ${live.length} live)`,
  );

  const finishedResults = file.results.map(
    (r): MatchResultDTO => ({
      matchId: r.matchId,
      status: 'finished',
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      homePenalties: null,
      awayPenalties: null,
      winnerTeamId: r.winnerTeamId,
    }),
  );

  const liveResults = live.map(
    (l): MatchResultDTO => ({
      matchId: l.matchId,
      status: 'live',
      homeScore: l.homeScore,
      awayScore: l.awayScore,
      homePenalties: null,
      awayPenalties: null,
      winnerTeamId: null,
      minute: l.minute,
    }),
  );

  return {
    results: [...finishedResults, ...liveResults],
    slots: file.slots.map(
      (s): ResolvedSlotDTO => ({
        matchId: s.matchId,
        homeTeamId: s.homeTeamId,
        awayTeamId: s.awayTeamId,
      }),
    ),
  };
}

/**
 * Offline / pre-kickoff provider. Returns no results by default (all matches "scheduled").
 * When SEED_SCENARIO is set, loads pre-built scenario data from
 * datasets/scenarios/<name>.json so you can demo the app at different tournament stages.
 *
 * Available: group-stage · quarterfinals · final
 * Generate:  npm run generate:scenarios
 */
export function createSeedProvider(): ResultsProvider {
  const scenarioName = process.env.SEED_SCENARIO?.trim();
  const loaded = scenarioName ? loadScenario(scenarioName) : null;

  return {
    async getResults(): Promise<MatchResultDTO[]> {
      return loaded?.results ?? [];
    },
    async getResolvedSlots(): Promise<ResolvedSlotDTO[]> {
      return loaded?.slots ?? [];
    },
    meta(): ProviderMeta {
      return {
        source: 'seed',
        lastUpdated: loaded ? new Date().toISOString() : null,
      };
    },
  };
}
