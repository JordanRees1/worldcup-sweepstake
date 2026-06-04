import { describe, expect, it } from 'vitest';
import type { Match, Team } from '@sweepstake/shared';
import { loadDataset } from '../data/dataset';
import { computeAllGroupStandings, computeGroupStandings } from './standings';

const teams: Team[] = [1, 2, 3, 4].map((id) => ({
  id,
  name: `T${id}`,
  fifaCode: `T${id}`,
  group: 'A',
  isPlaceholder: false,
}));

function gm(id: number, home: number, away: number, homeScore: number, awayScore: number): Match {
  return {
    id,
    matchNumber: id,
    stage: 'Group Stage',
    stageOrder: 1,
    group: 'A',
    label: 'Group A',
    kickoffAt: '2026-06-11T15:00:00-06:00',
    venueId: 1,
    homeTeamId: home,
    awayTeamId: away,
    status: 'finished',
    result: { homeScore, awayScore },
  };
}

describe('computeGroupStandings', () => {
  it('ranks by points, then GD, then GF, then head-to-head', () => {
    // T1 and T2 both finish on 6 pts / +2 GD / 6 GF; T1 beat T2 head-to-head, so T1 ranks first.
    const matches: Match[] = [
      gm(1, 1, 2, 2, 1), // T1 beats T2 (the head-to-head edge)
      gm(2, 1, 3, 3, 1), // T1 beats T3
      gm(3, 4, 1, 2, 1), // T4 beats T1
      gm(4, 2, 3, 3, 1), // T2 beats T3
      gm(5, 2, 4, 2, 1), // T2 beats T4
      gm(6, 3, 4, 2, 2), // T3 draws T4
    ];
    const table = computeGroupStandings('A', teams, matches);
    expect(table.rows.map((r) => r.teamId)).toEqual([1, 2, 4, 3]);

    const [first, second] = table.rows;
    expect(first?.points).toBe(6);
    expect(second?.points).toBe(6);
    expect(first?.goalDifference).toBe(second?.goalDifference);
    expect(first?.goalsFor).toBe(second?.goalsFor);
    expect(first?.teamId).toBe(1); // tie resolved by head-to-head
  });

  it('returns a stable, zeroed table before any results', () => {
    const table = computeGroupStandings('A', teams, []);
    expect(table.rows).toHaveLength(4);
    expect(table.rows.every((r) => r.played === 0 && r.points === 0)).toBe(true);
    expect(table.rows.map((r) => r.teamId)).toEqual([1, 2, 3, 4]);
  });
});

describe('computeAllGroupStandings (real dataset, seed mode)', () => {
  it('produces 12 groups of 4 with no games played yet', () => {
    const ds = loadDataset();
    const tables = computeAllGroupStandings(ds.teams, ds.matches);
    expect(tables).toHaveLength(12);
    expect(tables.map((t) => t.group)).toEqual('ABCDEFGHIJKL'.split(''));
    for (const t of tables) {
      expect(t.rows).toHaveLength(4);
      expect(t.rows.every((r) => r.played === 0)).toBe(true);
    }
  });
});
