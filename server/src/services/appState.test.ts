import { describe, expect, it } from 'vitest';
import { loadDataset } from '../data/dataset';
import type { ResultsProvider } from '../providers';
import { createSeedProvider } from '../providers/seedProvider';
import { computeAppState, createAppStateService } from './appState';

describe('computeAppState (seed)', () => {
  it('produces 6 upcoming players, 12 group tables, all matches scheduled', async () => {
    const ds = loadDataset();
    const state = await computeAppState(ds, createSeedProvider());

    expect(state.leaderboard).toHaveLength(6);
    expect(state.leaderboard.every((p) => p.aliveCount === 0 && p.points === 0)).toBe(true);
    expect(state.groupTables).toHaveLength(12);
    expect(state.matches.every((m) => m.status === 'scheduled')).toBe(true);
    expect(state.teamStatuses.size).toBe(48);
    expect(state.dataSource).toBe('seed');
    expect(state.lastUpdated).toBeNull();
  });
});

describe('computeAppState (with results)', () => {
  it('reflects a finished group result in match state, GD and the owner leaderboard', async () => {
    const ds = loadDataset();
    // Match 1 = Mexico (team 1) vs South Africa (team 2); Mexico win 2-0.
    const provider: ResultsProvider = {
      getResults: async () => [
        {
          matchId: 1,
          status: 'finished',
          homeScore: 2,
          awayScore: 0,
          homePenalties: null,
          awayPenalties: null,
          winnerTeamId: 1,
        },
      ],
      getResolvedSlots: async () => [],
      meta: () => ({ source: 'live', lastUpdated: '2026-06-11T21:00:00Z' }),
    };

    const state = await computeAppState(ds, provider);
    const m1 = state.matches.find((m) => m.id === 1);
    expect(m1?.status).toBe('finished');
    expect(m1?.result?.homeScore).toBe(2);

    // The player who owns Mexico (team 1) gets GD +2; others 0.
    const ownerId = ds.picks.find((p) => p.teamId === 1)?.playerId;
    const owner = state.leaderboard.find((e) => e.player.id === ownerId);
    expect(owner?.goalDifference).toBe(2);
    expect(state.dataSource).toBe('live');
  });
});

describe('createAppStateService caching', () => {
  it('serves a cached state within the TTL (single computation)', async () => {
    const ds = loadDataset();
    let calls = 0;
    const provider: ResultsProvider = {
      getResults: async () => {
        calls += 1;
        return [];
      },
      getResolvedSlots: async () => [],
      meta: () => ({ source: 'seed', lastUpdated: null }),
    };
    const service = createAppStateService(ds, provider, 10_000);
    await service.get();
    await service.get();
    await service.get();
    expect(calls).toBe(1);
  });
});
