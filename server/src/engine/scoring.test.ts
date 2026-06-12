import { describe, expect, it } from 'vitest';
import type { Match, Pick, Player, Team, TeamStatus } from '@sweepstake/shared';
import { loadDataset } from '../data/dataset';
import { computeDecidedGroups, computeQualification } from './qualification';
import {
  DEFAULT_SCORING,
  buildLeaderboard,
  computePlayerGoalDifference,
  computeTeamScores,
} from './scoring';
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

const mkMatch = (override: Partial<Match> = {}): Match => ({
  id: 1,
  matchNumber: 1,
  stage: 'Group Stage',
  stageOrder: 1,
  group: 'H',
  label: 'Group H',
  kickoffAt: '2026-06-15T12:00:00-04:00',
  venueId: 1,
  homeTeamId: 10,
  awayTeamId: 11,
  status: 'finished',
  ...override,
});

// ── computeTeamScores ───────────────────────────────────────────────────────────

describe('computeTeamScores', () => {
  it('awards 3 to the winner and the negative margin to the loser', () => {
    const m = mkMatch({ result: { homeScore: 3, awayScore: 1, winnerTeamId: 10 } });
    const r = computeTeamScores([m], DEFAULT_SCORING);
    expect(r.get(10)).toMatchObject({ points: 3, won: 1, lost: 0, played: 1 });
    expect(r.get(11)).toMatchObject({ points: -2, won: 0, lost: 1, played: 1 }); // 1-3 → −2
  });

  it('awards 1 to each team in a group draw', () => {
    const m = mkMatch({ result: { homeScore: 1, awayScore: 1, winnerTeamId: null } });
    const r = computeTeamScores([m], DEFAULT_SCORING);
    expect(r.get(10)).toMatchObject({ points: 1, drawn: 1 });
    expect(r.get(11)).toMatchObject({ points: 1, drawn: 1 });
  });

  it('a knockout penalty-shootout win is +3 / 0 (level full-time score)', () => {
    const m = mkMatch({
      stage: 'Round of 32',
      group: undefined,
      result: { homeScore: 1, awayScore: 1, homePenalties: 4, awayPenalties: 3, winnerTeamId: 10 },
    });
    const r = computeTeamScores([m], DEFAULT_SCORING);
    expect(r.get(10)).toMatchObject({ points: 3, won: 1 });
    expect(r.get(11)).toMatchObject({ points: 0, lost: 1 }); // lost, but margin 0
  });

  it('accumulates points and record across multiple matches', () => {
    const matches = [
      mkMatch({ id: 1, result: { homeScore: 2, awayScore: 0, winnerTeamId: 10 } }),
      mkMatch({ id: 2, homeTeamId: 10, awayTeamId: 12, result: { homeScore: 0, awayScore: 4, winnerTeamId: 12 } }),
    ];
    const r = computeTeamScores(matches, DEFAULT_SCORING);
    expect(r.get(10)).toMatchObject({ points: -1, won: 1, lost: 1, played: 2 }); // +3 then −4
  });

  it('ignores matches that are not finished (e.g. live or scheduled)', () => {
    const live = mkMatch({ status: 'live', result: { homeScore: 1, awayScore: 0, winnerTeamId: 10 } });
    const scheduled = mkMatch({ id: 2, status: 'scheduled' });
    expect(computeTeamScores([live, scheduled], DEFAULT_SCORING).size).toBe(0);
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
  const statuses = new Map([
    [10, mkStatus(10, { outcome: 'alive', alive: true })],
    [11, mkStatus(11, { outcome: 'alive', alive: true })],
  ]);
  const rec = (points: number, o: Partial<import('./scoring').TeamScoreRecord> = {}) => ({
    points,
    won: 0,
    drawn: 0,
    lost: 0,
    played: 1,
    ...o,
  });

  it('ranks by match points first', () => {
    const scores = new Map([[10, rec(6, { won: 2 })], [11, rec(3, { won: 1 })]]);
    const lb = buildLeaderboard(players, picks, teams, statuses, new Map(), scores);
    expect(lb[0].player.name).toBe('Alice'); // 6 > 3
    expect(lb[0].points).toBe(6);
    expect(lb.map((e) => e.rank)).toEqual([1, 2]);
  });

  it('breaks points ties by goal difference', () => {
    const scores = new Map([[10, rec(3, { won: 1 })], [11, rec(3, { won: 1 })]]);
    const teamGDs = new Map([[10, 1], [11, 5]]);
    const lb = buildLeaderboard(players, picks, teams, statuses, teamGDs, scores);
    expect(lb[0].player.name).toBe('Bob'); // equal points → GD 5 > 1
  });

  it('applies the −50 wooden spoon when every played game was a loss', () => {
    const scores = new Map([
      [10, rec(-2, { lost: 2, played: 2 })], // Alice: all losses
      [11, rec(3, { won: 1, played: 1 })], // Bob: a win
    ]);
    const lb = buildLeaderboard(players, picks, teams, statuses, new Map(), scores);
    const alice = lb.find((e) => e.player.name === 'Alice')!;
    const bob = lb.find((e) => e.player.name === 'Bob')!;
    expect(alice.points).toBe(-52); // −2 base − 50 spoon
    expect(bob.points).toBe(3); // a win spares the spoon
    expect(lb[lb.length - 1].player.name).toBe('Alice'); // rock bottom
  });

  it('no wooden spoon if a player has any win or draw', () => {
    const scores = new Map([[10, rec(1, { drawn: 1, played: 3, lost: 2 })]]);
    const lb = buildLeaderboard([players[0]], [picks[0]], teams, statuses, new Map(), scores);
    expect(lb[0].points).toBe(1); // a single draw spares the −50
  });

  it('no wooden spoon before any games are played', () => {
    const scores = new Map([[10, rec(0, { played: 0 })]]);
    const lb = buildLeaderboard([players[0]], [picks[0]], teams, statuses, new Map(), scores);
    expect(lb[0].points).toBe(0);
  });

  it('includes all 6 sweepstake players from the real dataset (seed mode = all 0)', () => {
    const ds = loadDataset();
    const tables = computeAllGroupStandings(ds.teams, ds.matches);
    const decided = computeDecidedGroups(ds.matches);
    const qual = computeQualification(tables, decided);
    const teamStatuses = computeTeamStatuses(ds.teams, ds.matches, tables, decided, qual);
    const gds = computeTeamGoalDifferences(ds.matches);
    const scores = computeTeamScores(ds.matches);
    const lb = buildLeaderboard(ds.players, ds.picks, ds.teams, teamStatuses, gds, scores);
    expect(lb).toHaveLength(6);
    expect(lb.every((e) => e.points === 0)).toBe(true); // no games → no points, no spoon
    expect(lb.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
