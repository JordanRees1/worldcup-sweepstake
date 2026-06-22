import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Match } from '@sweepstake/shared';
import { loadDataset } from '../data/dataset';
import { DATASETS_DIR } from '../data/paths';
import type { GroupLetter } from '@sweepstake/shared';
import { computeAllGroupStandings, computeDecidedGroups, type RankedThird } from './index';
import { assignBestThirds, projectRound32, rankAllThirds } from './knockout';

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

describe('assignBestThirds (official Annexe C)', () => {
  // Build the 8 qualifying thirds for a known combination, with teamId = group letter's position.
  const third = (group: GroupLetter, teamId: number): RankedThird => ({
    row: {
      teamId,
      name: `Third ${group}`,
      played: 3,
      won: 1,
      drawn: 0,
      lost: 2,
      goalsFor: 1,
      goalsAgainst: 2,
      goalDifference: -1,
      points: 3,
      rank: 3,
    },
    group,
  });

  it('matches Annexe C row 1 (groups E,F,G,H,I,J,K,L)', () => {
    // Annexe C row 1 → winner order [A,B,D,E,G,I,K,L] = thirds E,J,I,F,H,G,L,K.
    // Winner→match: A=79 B=85 D=82 E=75 G=81 I=78 K=88 L=80.
    const id: Record<string, number> = { E: 5, F: 6, G: 7, H: 8, I: 9, J: 10, K: 11, L: 12 };
    const thirds = (['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as GroupLetter[]).map((g) =>
      third(g, id[g]),
    );
    const a = assignBestThirds(thirds);
    expect(a.get(79)).toBe(id.E); // winner A vs 3E
    expect(a.get(85)).toBe(id.J); // winner B vs 3J
    expect(a.get(82)).toBe(id.I); // winner D vs 3I
    expect(a.get(75)).toBe(id.F); // winner E vs 3F
    expect(a.get(81)).toBe(id.H); // winner G vs 3H
    expect(a.get(78)).toBe(id.G); // winner I vs 3G
    expect(a.get(88)).toBe(id.L); // winner K vs 3L
    expect(a.get(80)).toBe(id.K); // winner L vs 3K
  });

  it('places exactly the 8 given thirds, one per slot', () => {
    const thirds = (['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as GroupLetter[]).map((g, i) =>
      third(g, 100 + i),
    );
    const a = assignBestThirds(thirds);
    expect(a.size).toBe(8);
    expect(new Set(a.values()).size).toBe(8);
    expect(new Set(a.values())).toEqual(new Set(thirds.map((t) => t.row.teamId)));
  });
});

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
