import type { Match, Team } from '@sweepstake/shared';
import { createFootballApiProvider } from './footballApiProvider';
import { createSeedProvider } from './seedProvider';
import type { ResultsProvider } from './types';

export type { MatchResultDTO, ProviderMeta, ResolvedSlotDTO, ResultsProvider } from './types';

export interface ProviderConfig {
  source: 'seed' | 'live';
  apiKey?: string;
  cacheTtlMs?: number;
}

/**
 * Create the appropriate ResultsProvider from environment config.
 * Falls back to seed if source=live but no API key is provided.
 */
export function createProvider(
  teams: Team[],
  matches: Match[],
  config: ProviderConfig,
): ResultsProvider {
  if (config.source === 'live' && config.apiKey) {
    return createFootballApiProvider(teams, matches, {
      apiKey: config.apiKey,
      cacheTtlMs: config.cacheTtlMs ?? 60_000,
    });
  }
  if (config.source === 'live') {
    console.warn('[provider] DATA_SOURCE=live but no FOOTBALL_API_KEY set; falling back to seed');
  }
  return createSeedProvider();
}
