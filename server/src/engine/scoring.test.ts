import { describe, expect, it } from 'vitest';
import type { Match, Pick, Player, Team, TeamStatus } from '@sweepstake/shared';
import { loadDataset } from '../data/dataset';
import { computeDecidedGroups, computeQualification } from './qualification';
import { DEFAULT_SCORING, buildLeaderboard, computePlayerGoalDifference, scoreTeam } from './scoring';
import { computeAllGroupStandings } from './standings';
import { computeTeamGoalDifferences, computeTeamStatuses } from './status';

// ── fixtures ──────────────────────────────────────────────────────────────────

const mkStatus = (teamId: number, override: Partial<TeamStatus> = {}): TeamStatus => ({
  teamId,
  outcome: 'upcoming',
  alive: false,
  furthestStage: 'Group Stage',
  ...override,
});

// ── scoreTeam ─────────────────────────────────────────────────────────────────

describe('scoreTeam', () => {
  it.each([
    ['Group Stage', 0] as const,
    ['Round of 32', 1] as const,
    ['Round of 16', 2] as const,
    ['Quarterfinals', 4] as const,
    ['Semifinals', 6] as const,
    ['Third Place Playoff', 6] as const,
    ['Final', 8] as const,
  ])('team reaching %s scores %i pts', (stage, expected) => {
    const status = mkStatus(1, { furthestStage: stage });
    expect(scoreTeam(status, DEFAULT_SCORING)).toBe(expected);
  });

  it('champion scores 12 (Final 8 + bonus 4)', () => {
    const status = mkStatus(1, { outcome: 'champion', alive: true, furthestStage: 'Final' });
    expect(scoreTeam(status, DEFAULT_SCORING)).toBe(12);
  });
});

// ── computePlayerGoalDifference ───────────────────────────────────────────────

describe('computePlayerGoalDifference', () => {
  it('sums GDs for the given team ids', () => {
    const gds = new Map([[1, 3], [2, -1], [3, 2]]);
    expect(computePlayerGoalDifference([1, 2, 3], gds)).toBe(4);
  });

  it('treats unknown teams as 0 GD (no matches played)', () => {
    expect(computePlayerGoalDifference([99], new Map())).toBe(0);
  });
});

// ── buildLeaderboard ──────────────────────────────────────────────────────────

describe('buildLeaderboard', () => {
  const players: Player[] = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ];
  const teams: Team[] = [
    { id: 10, name: 'Spain', fifaCode: 'ESP', group: 'H', isPlaceholder: false },
    { id: 11, name: 'England', fifaCode: 'ENG', group: 'L', isPlaceholder: false },
  ];
  const picks: Pick[] = [
    { playerId: 1, teamId: 10, rawName: 'Spain', matched: true },
    { playerId: 2, teamId: 11, rawName: 'England', matched: true },
  ];

  it('ranks by alive count first', () => {
    const statuses = new Map([
      [10, mkStatus(10, { outcome: 'alive', alive: true, furthestStage: 'Round of 16' })],
      [11, mkStatus(11, { outcome: 'eliminated', alive: false, furthestStage: 'Group Stage' })],
    ]);
    const lb = buildLeaderboard(players, picks, teams, statuses, new Map());
    expect(lb[0].player.name).toBe('Alice'); // 1 alive > 0 alive
    expect(lb[0].rank).toBe(1);
    expect(lb[1].rank).toBe(2);
  });

  it('breaks alive-count ties by furthest stage reached', () => {
    const statuses = new Map([
      [10, mkStatus(10, { outcome: 'eliminated', alive: false, furthestStage: 'Round of 16' })],
      [11, mkStatus(11, { outcome: 'eliminated', alive: false, furthestStage: 'Group Stage' })],
    ]);
    const lb = buildLeaderboard(players, picks, teams, statuses, new Map());
    expect(lb[0].player.name).toBe('Alice'); // R16 > Group Stage
  });

  it('breaks stage ties by points, then GD', () => {
    const statuses = new Map([
      [10, mkStatus(10, { outcome: 'eliminated', alive: false, furthestStage: 'Round of 16' })],
      [11, mkStatus(11, { outcome: 'eliminated', alive: false, furthestStage: 'Round of 16' })],
    ]);
    // same stage → same points (both 2) → GD tiebreak
    const teamGDs = new Map([[10, 1], [11, 5]]);
    const lb = buildLeaderboard(players, picks, teams, statuses, teamGDs);
    expect(lb[0].player.name).toBe('Bob'); // GD 5 > 1
  });

  it('computes goalDifference from real match data', () => {
    const finishedMatch: Match = {
      id: 1, matchNumber: 1, stage: 'Group Stage', stageOrder: 1,
      group: 'H', label: 'Group H',
      kickoffAt: '2026-06-15T12:00:00-04:00', venueId: 1,
      homeTeamId: 10, awayTeamId: 11,
      status: 'finished',
      result: { homeScore: 3, awayScore: 1, winnerTeamId: 10 },
    };
    const gds = computeTeamGoalDifferences([finishedMatch]);
    const statuses = new Map([
      [10, mkStatus(10, { outcome: 'alive', alive: true, furthestStage: 'Group Stage' })],
      [11, mkStatus(11, { outcome: 'alive', alive: true, furthestStage: 'Group Stage' })],
    ]);
    const lb = buildLeaderboard(players, picks, teams, statuses, gds);
    const alice = lb.find((e) => e.player.name === 'Alice')!;
    const bob = lb.find((e) => e.player.name === 'Bob')!;
    expect(alice.goalDifference).toBe(2);   // +3-1
    expect(bob.goalDifference).toBe(-2);    // +1-3
  });

  it('includes all 6 sweepstake players from the real dataset (seed mode = all upcoming)', () => {
    const ds = loadDataset();
    const tables = computeAllGroupStandings(ds.teams, ds.matches);
    const decided = computeDecidedGroups(ds.matches);
    const qual = computeQualification(tables, decided);
    const statuses = computeTeamStatuses(ds.teams, ds.matches, tables, decided, qual);
    const gds = computeTeamGoalDifferences(ds.matches);
    const lb = buildLeaderboard(ds.players, ds.picks, ds.teams, statuses, gds);
    expect(lb).toHaveLength(6);
    expect(lb.every((e) => e.aliveCount === 0)).toBe(true); // no results yet
    expect(lb.every((e) => e.points === 0)).toBe(true);
    expect(lb.every((e) => e.goalDifference === 0)).toBe(true);
    expect(lb.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
