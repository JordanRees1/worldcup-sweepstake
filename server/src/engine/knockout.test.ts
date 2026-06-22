import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Match } from '@sweepstake/shared';
import { loadDataset } from '../data/dataset';
import { DATASETS_DIR } from '../data/paths';
import { computeAllGroupStandings, computeDecidedGroups } from './index';
import { projectRound32, rankAllThirds } from './knockout';

// Drive the projection from the committed "group-stage" scenario (matchdays 1+2 complete).
const ds = loadDataset();
const scenario = JSON.parse(
  readFileSync(join(DATASETS_DIR, 'scenarios', 'group-stage.json'), 'utf8'),
) as { results: { matchId: number; homeScore: number; awayScore: number; winnerTeamId: number }[] };

const byId = new Map(scenario.results.map((r) => [r.matchId, r]));
const hydrated: Match[] = ds.matches.map((m) => {
  const r = byId.get(m.id);
  return r
    ? {
        ...m,
        status: 'finished' as const,
        result: { homeScore: r.homeScore, awayScore: r.awayScore, winnerTeamId: r.winnerTeamId },
      }
    : m;
});
const tables = computeAllGroupStandings(ds.teams, hydrated);
const decided = computeDecidedGroups(hydrated);

describe('rankAllThirds', () => {
  it('ranks all 12 groups’ current third-placed teams', () => {
    const thirds = rankAllThirds(tables);
    expect(thirds).toHaveLength(12);
    // Sorted best → worst by points (then GD): each is ≥ the next on the third-place criteria.
    for (let i = 1; i < thirds.length; i++) {
      const a = thirds[i - 1].row;
      const b = thirds[i].row;
      expect(a.points > b.points || (a.points === b.points && a.goalDifference >= b.goalDifference)).toBe(
        true,
      );
    }
  });
});

describe('projectRound32', () => {
  const proj = projectRound32(hydrated, tables, decided);

  it('projects all 16 R32 fixtures with two resolved teams each', () => {
    expect(proj.size).toBe(16);
    for (const m of proj.values()) {
      expect(m.home.teamId).not.toBeNull();
      expect(m.away.teamId).not.toBeNull();
    }
  });

  it('uses 32 distinct teams (a clean partition — top-2 of each group + 8 thirds)', () => {
    const ids = [...proj.values()].flatMap((m) => [m.home.teamId, m.away.teamId]);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
  });

  it('every projected place is provisional while no group is decided', () => {
    expect(decided.size).toBe(0); // matchday 1+2 only
    for (const m of proj.values()) {
      expect(m.home.provisional).toBe(true);
      expect(m.away.provisional).toBe(true);
    }
  });

  it('the 8 best thirds it places match rankAllThirds’ top 8', () => {
    const placed = new Set(
      [...proj.values()].flatMap((m) => [m.home.teamId, m.away.teamId]),
    );
    const top8Thirds = rankAllThirds(tables).slice(0, 8);
    for (const t of top8Thirds) expect(placed.has(t.row.teamId)).toBe(true);
  });
});
