import { describe, expect, it } from 'vitest';
import type { Match, Team } from '@sweepstake/shared';
import { loadDataset } from '../data/dataset';
import { computeAllGroupStandings } from './standings';
import { computeDecidedGroups, computeQualification } from './qualification';
import { computeTeamGoalDifferences, computeTeamStatuses } from './status';

// ── helpers ──────────────────────────────────────────────────────────────────

const mkTeam = (id: number, group: Team['group'] = 'A'): Team => ({
  id,
  name: `T${id}`,
  fifaCode: `T${id}`,
  group,
  isPlaceholder: false,
});

function gm(
  id: number,
  home: number,
  away: number,
  hs: number,
  as_: number,
  group: Team['group'] = 'A',
): Match {
  return {
    id,
    matchNumber: id,
    stage: 'Group Stage',
    stageOrder: 1,
    group: group ?? undefined,
    label: `Group ${group}`,
    kickoffAt: '2026-06-11T15:00:00-06:00',
    venueId: 1,
    homeTeamId: home,
    awayTeamId: away,
    status: 'finished',
    result: {
      homeScore: hs,
      awayScore: as_,
      winnerTeamId: hs > as_ ? home : hs < as_ ? away : null,
    },
  };
}

function km(id: number, home: number, away: number, winner: number, stage = 'Round of 32', stageOrder = 2): Match {
  return {
    id,
    matchNumber: id,
    stage: stage as Match['stage'],
    stageOrder,
    label: `W${id - 1}`,
    kickoffAt: '2026-06-28T15:00:00-07:00',
    venueId: 1,
    homeTeamId: home,
    awayTeamId: away,
    status: 'finished',
    result: { homeScore: 2, awayScore: 1, winnerTeamId: winner },
  };
}

// A completed group A with 4 teams: T1 9pts, T2 6pts, T3 3pts, T4 0pts
const groupTeams = [1, 2, 3, 4].map((id) => mkTeam(id));
const groupMatches: Match[] = [
  gm(1, 1, 2, 3, 0), gm(2, 1, 3, 2, 0), gm(3, 1, 4, 1, 0),
  gm(4, 2, 3, 2, 0), gm(5, 2, 4, 2, 0), gm(6, 3, 4, 2, 0),
];

// ── tests ─────────────────────────────────────────────────────────────────────

describe('computeTeamGoalDifferences', () => {
  it('returns empty map in seed mode (no finished matches)', () => {
    const { matches } = loadDataset();
    expect(computeTeamGoalDifferences(matches).size).toBe(0);
  });

  it('correctly computes GD from finished group matches', () => {
    const gds = computeTeamGoalDifferences(groupMatches);
    // T1 scores 3+2+1=6, concedes 0. T4 scores 0, concedes 1+2+2=5.
    expect(gds.get(1)).toBe(6);
    expect(gds.get(4)).toBe(-5);
  });
});

describe('computeTeamStatuses', () => {
  function buildStatuses(teams: Team[], matches: Match[]) {
    const tables = computeAllGroupStandings(teams, matches);
    const decided = computeDecidedGroups(matches);
    const qual = computeQualification(tables, decided);
    return computeTeamStatuses(teams, matches, tables, decided, qual);
  }

  it('marks all 48 teams as upcoming in seed mode', () => {
    const { teams, matches } = loadDataset();
    const tables = computeAllGroupStandings(teams, matches);
    const decided = computeDecidedGroups(matches);
    const qual = computeQualification(tables, decided);
    const statuses = computeTeamStatuses(teams, matches, tables, decided, qual);

    const all = [...statuses.values()];
    expect(all.every((s) => s.outcome === 'upcoming')).toBe(true);
    expect(all.every((s) => s.alive === false)).toBe(true);
  });

  it('rank-1 and rank-2 are alive; rank-4 is eliminated after a decided group', () => {
    const statuses = buildStatuses(groupTeams, groupMatches);
    expect(statuses.get(1)?.outcome).toBe('alive');   // rank 1
    expect(statuses.get(2)?.outcome).toBe('alive');   // rank 2
    expect(statuses.get(4)?.outcome).toBe('eliminated');
    expect(statuses.get(4)?.eliminatedAtStage).toBe('Group Stage');
  });

  it('rank-3 stays alive when not all 12 groups are decided', () => {
    const statuses = buildStatuses(groupTeams, groupMatches);
    // Only 1 group decided, so rank-3 (T3) waits for best-third determination
    expect(statuses.get(3)?.outcome).toBe('alive');
  });

  it('knockout win advances a team; knockout loss eliminates', () => {
    // T1 and T2 qualify from group, then play each other in R32
    const allMatches: Match[] = [
      ...groupMatches,
      km(73, 1, 2, 1), // T1 beats T2 in R32
    ];
    const statuses = buildStatuses(groupTeams, allMatches);
    expect(statuses.get(1)?.outcome).toBe('alive');
    expect(statuses.get(1)?.furthestStage).toBe('Round of 32');
    expect(statuses.get(2)?.outcome).toBe('eliminated');
    expect(statuses.get(2)?.eliminatedAtStage).toBe('Round of 32');
  });

  it('winner of match 104 is champion', () => {
    const allMatches: Match[] = [
      ...groupMatches,
      km(104, 1, 2, 1, 'Final', 7),
    ];
    const statuses = buildStatuses(groupTeams, allMatches);
    expect(statuses.get(1)?.outcome).toBe('champion');
    expect(statuses.get(1)?.alive).toBe(true);
    expect(statuses.get(1)?.furthestStage).toBe('Final');
  });

  it('Third Place Playoff winner is not alive (done, cannot win the cup)', () => {
    const allMatches: Match[] = [
      ...groupMatches,
      km(103, 1, 2, 1, 'Third Place Playoff', 6),
    ];
    const statuses = buildStatuses(groupTeams, allMatches);
    // Winner gets points via furthestStage but is NOT alive in sweepstake terms
    expect(statuses.get(1)?.outcome).toBe('eliminated');
    expect(statuses.get(1)?.alive).toBe(false);
    expect(statuses.get(1)?.furthestStage).toBe('Third Place Playoff');
    // Loser is also eliminated
    expect(statuses.get(2)?.outcome).toBe('eliminated');
    expect(statuses.get(2)?.alive).toBe(false);
  });

  it('upcoming match updates furthestStage so finalists show "Final" not last finished stage', () => {
    const upcoming: Match = {
      id: 104,
      matchNumber: 104,
      stage: 'Final',
      stageOrder: 7,
      label: 'W101 vs W102',
      kickoffAt: '2026-07-19T15:00:00-04:00',
      venueId: 8,
      homeTeamId: 1,
      awayTeamId: 2,
      status: 'scheduled',
    };
    const allMatches = [...groupMatches, upcoming];
    const statuses = buildStatuses(groupTeams, allMatches);
    // Both teams should now show Final as their furthestStage
    expect(statuses.get(1)?.furthestStage).toBe('Final');
    expect(statuses.get(2)?.furthestStage).toBe('Final');
    expect(statuses.get(1)?.nextMatchId).toBe(104);
  });

  it('sets nextMatchId for teams in upcoming knockout slots', () => {
    const upcoming: Match = {
      id: 73,
      matchNumber: 73,
      stage: 'Round of 32',
      stageOrder: 2,
      label: '2A vs 2B',
      kickoffAt: '2026-06-28T15:00:00-07:00',
      venueId: 1,
      homeTeamId: 1,
      awayTeamId: 2,
      status: 'scheduled',
    };
    const allMatches = [...groupMatches, upcoming];
    const statuses = buildStatuses(groupTeams, allMatches);
    expect(statuses.get(1)?.nextMatchId).toBe(73);
    expect(statuses.get(2)?.nextMatchId).toBe(73);
  });
});
