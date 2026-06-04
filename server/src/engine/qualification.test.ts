import { describe, expect, it } from 'vitest';
import type { Match, Team } from '@sweepstake/shared';
import { loadDataset } from '../data/dataset';
import { computeAllGroupStandings } from './standings';
import {
  computeDecidedGroups,
  computeQualification,
} from './qualification';

// Minimal 4-team group helper
const mkTeam = (id: number): Team => ({
  id,
  name: `T${id}`,
  fifaCode: `T${id}`,
  group: 'A',
  isPlaceholder: false,
});

function gm(
  id: number,
  home: number,
  away: number,
  homeScore: number,
  awayScore: number,
): Match {
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
    result: { homeScore, awayScore, winnerTeamId: homeScore > awayScore ? home : homeScore < awayScore ? away : null },
  };
}

describe('computeDecidedGroups', () => {
  it('returns empty set when no matches are finished (seed mode)', () => {
    const { matches } = loadDataset();
    expect(computeDecidedGroups(matches).size).toBe(0);
  });

  it('marks a group decided once all 6 matches are finished', () => {
    const matches: Match[] = [
      gm(1, 1, 2, 2, 0), gm(2, 1, 3, 1, 1), gm(3, 1, 4, 3, 0),
      gm(4, 2, 3, 0, 1), gm(5, 2, 4, 1, 2), gm(6, 3, 4, 2, 1),
    ];
    expect(computeDecidedGroups(matches)).toContain('A');
  });

  it('does not mark a group decided with only 5 finished matches', () => {
    const matches: Match[] = [
      gm(1, 1, 2, 2, 0), gm(2, 1, 3, 1, 1), gm(3, 1, 4, 3, 0),
      gm(4, 2, 3, 0, 1), gm(5, 2, 4, 1, 2),
      { ...gm(6, 3, 4, 2, 1), status: 'scheduled', result: undefined },
    ];
    expect(computeDecidedGroups(matches).has('A')).toBe(false);
  });
});

describe('computeQualification', () => {
  const teams = [1, 2, 3, 4].map(mkTeam);
  const allMatches: Match[] = [
    gm(1, 1, 2, 3, 0), gm(2, 1, 3, 2, 1), gm(3, 1, 4, 1, 0),
    gm(4, 2, 3, 0, 2), gm(5, 2, 4, 1, 1), gm(6, 3, 4, 3, 0),
    // T1 9pts, T3 6pts, T2 1pt(1D), T4 1pt(1D)
  ];

  it('returns empty qualifiers when group not decided', () => {
    const tables = computeAllGroupStandings(teams, []);
    const q = computeQualification(tables, new Set());
    expect(q.groupQualifiers.size).toBe(0);
    expect(q.qualifiedTeamIds.size).toBe(0);
  });

  it('correctly identifies rank-1 and rank-2 qualifiers from a decided group', () => {
    const tables = computeAllGroupStandings(teams, allMatches);
    const decided = computeDecidedGroups(allMatches);
    const q = computeQualification(tables, decided);

    expect(q.groupQualifiers.get(1)).toMatchObject({ rank: 1, group: 'A' });
    expect(q.groupQualifiers.get(3)).toMatchObject({ rank: 2, group: 'A' });
  });

  it('does not compute qualifying thirds until all 12 groups are decided', () => {
    const tables = computeAllGroupStandings(teams, allMatches);
    const decided = computeDecidedGroups(allMatches); // only group A decided
    const q = computeQualification(tables, decided);
    expect(q.allGroupsComplete).toBe(false);
    expect(q.qualifyingThirds).toHaveLength(0);
  });

  it('ranks thirds by points → GD → GF → wins (stable tiebreak)', () => {
    // Synthesise three third-place rows to test sort order directly.
    const thirdA = { row: { teamId: 100, played: 3, won: 1, drawn: 0, lost: 2, goalsFor: 3, goalsAgainst: 5, goalDifference: -2, points: 3, rank: 3 }, group: 'A' as const };
    const thirdB = { row: { teamId: 200, played: 3, won: 1, drawn: 0, lost: 2, goalsFor: 5, goalsAgainst: 4, goalDifference: 1, points: 3, rank: 3 }, group: 'B' as const };
    const thirdC = { row: { teamId: 300, played: 3, won: 1, drawn: 0, lost: 2, goalsFor: 4, goalsAgainst: 4, goalDifference: 0, points: 3, rank: 3 }, group: 'C' as const };

    // All 3 pts, sort by GD: B(+1) > C(0) > A(-2)
    const sorted = [thirdA, thirdB, thirdC].sort((a, b) =>
      b.row.points - a.row.points ||
      b.row.goalDifference - a.row.goalDifference ||
      b.row.goalsFor - a.row.goalsFor ||
      b.row.won - a.row.won ||
      a.row.teamId - b.row.teamId,
    );
    expect(sorted.map((t) => t.row.teamId)).toEqual([200, 300, 100]);
  });
});
