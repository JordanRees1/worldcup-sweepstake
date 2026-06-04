import { describe, expect, it } from 'vitest';
import { loadDataset } from '../data/dataset';
import { createSeedProvider } from '../providers/seedProvider';
import { computeAppState, type AppState } from './appState';
import {
  buildBracket,
  buildGroups,
  buildHealth,
  buildMatches,
  buildOverview,
  buildPlayerDetail,
  buildPlayers,
  buildSchedule,
  buildTeams,
} from './responses';

let state: AppState;

async function getState(): Promise<AppState> {
  state ??= await computeAppState(loadDataset(), createSeedProvider());
  return state;
}

describe('response builders (seed)', () => {
  it('buildHealth', async () => {
    expect(buildHealth(await getState(), '1.2.3')).toEqual({
      ok: true,
      dataSource: 'seed',
      lastUpdated: null,
      version: '1.2.3',
    });
  });

  it('buildOverview: Group Stage + 6-player leaderboard', async () => {
    const o = buildOverview(await getState());
    expect(o.currentStage).toBe('Group Stage');
    expect(o.leaderboard).toHaveLength(6);
  });

  it('buildPlayers: 6 players', async () => {
    expect(buildPlayers(await getState()).players).toHaveLength(6);
  });

  it('buildPlayerDetail: returns fixtures for a real player, null for unknown', async () => {
    const s = await getState();
    const firstId = s.leaderboard[0]?.player.id ?? 0;
    const detail = buildPlayerDetail(s, firstId);
    expect(detail?.fixtures.length).toBeGreaterThan(0);
    expect(buildPlayerDetail(s, 9999)).toBeNull();
  });

  it('buildTeams: 48 teams each with a status', async () => {
    const t = buildTeams(await getState());
    expect(t.teams).toHaveLength(48);
    expect(t.teams.every((x) => x.status.teamId === x.team.id)).toBe(true);
  });

  it('buildGroups: 12 tables of 4', async () => {
    const g = buildGroups(await getState());
    expect(g.groups).toHaveLength(12);
    expect(g.groups.every((tbl) => tbl.rows.length === 4)).toBe(true);
  });

  it('buildBracket: 6 knockout rounds, teams unresolved in seed mode', async () => {
    const b = buildBracket(await getState());
    expect(b.rounds.map((r) => r.stage)).toEqual([
      'Round of 32',
      'Round of 16',
      'Quarterfinals',
      'Semifinals',
      'Third Place Playoff',
      'Final',
    ]);
    expect(b.rounds[0]?.nodes.every((n) => n.homeTeamId === null)).toBe(true);
  });

  it('buildMatches: filters by group and date', async () => {
    const s = await getState();
    expect(buildMatches(s, { group: 'A' }).matches).toHaveLength(6);
    expect(buildMatches(s, { stage: 'Group Stage' }).matches).toHaveLength(72);
    expect(buildMatches(s, { date: '2026-06-11' }).matches).toHaveLength(2);
  });

  it('buildSchedule: days are sorted ascending', async () => {
    const sched = buildSchedule(await getState());
    const dates = sched.days.map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates[0]).toBe('2026-06-11');
  });
});
