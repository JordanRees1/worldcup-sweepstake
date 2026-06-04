import type { ProviderMeta, MatchResultDTO, ResolvedSlotDTO, ResultsProvider } from './types';

/**
 * Offline / pre-kickoff provider. Returns no results — every match stays "scheduled".
 * Works with no API key and is the safe fallback when the live provider fails.
 */
export function createSeedProvider(): ResultsProvider {
  return {
    async getResults(): Promise<MatchResultDTO[]> {
      return [];
    },
    async getResolvedSlots(): Promise<ResolvedSlotDTO[]> {
      return [];
    },
    meta(): ProviderMeta {
      return { source: 'seed', lastUpdated: null };
    },
  };
}
