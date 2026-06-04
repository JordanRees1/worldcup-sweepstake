import { describe, expect, it } from 'vitest';
import type { Match } from '@sweepstake/shared';
import type { MatchResultDTO, ResolvedSlotDTO } from '../providers';
import { applyResults } from './applyResults';

const baseGroup: Match = {
  id: 1,
  matchNumber: 1,
  stage: 'Group Stage',
  stageOrder: 1,
  group: 'A',
  label: 'Group A',
  kickoffAt: '2026-06-11T15:00:00-06:00',
  venueId: 15,
  homeTeamId: 1,
  awayTeamId: 2,
  status: 'scheduled',
};

const baseKnockout: Match = {
  id: 73,
  matchNumber: 73,
  stage: 'Round of 32',
  stageOrder: 2,
  label: '2A vs 2B',
  kickoffAt: '2026-06-28T15:00:00-07:00',
  venueId: 6,
  homeTeamId: null,
  awayTeamId: null,
  status: 'scheduled',
};

describe('applyResults', () => {
  it('leaves matches untouched when there is no result or slot', () => {
    const out = applyResults([baseGroup], [], []);
    expect(out[0]).toBe(baseGroup); // same reference, no copy
  });

  it('attaches a result and status for a finished match', () => {
    const result: MatchResultDTO = {
      matchId: 1,
      status: 'finished',
      homeScore: 2,
      awayScore: 1,
      homePenalties: null,
      awayPenalties: null,
      winnerTeamId: 1,
    };
    const [m] = applyResults([baseGroup], [result], []);
    expect(m.status).toBe('finished');
    expect(m.result).toEqual({ homeScore: 2, awayScore: 1, winnerTeamId: 1 });
  });

  it('updates status but attaches no result when scores are null', () => {
    const result: MatchResultDTO = {
      matchId: 1,
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      homePenalties: null,
      awayPenalties: null,
      winnerTeamId: null,
    };
    const [m] = applyResults([baseGroup], [result], []);
    expect(m.status).toBe('scheduled');
    expect(m.result).toBeUndefined();
  });

  it('includes penalties when present', () => {
    const result: MatchResultDTO = {
      matchId: 73,
      status: 'finished',
      homeScore: 1,
      awayScore: 1,
      homePenalties: 4,
      awayPenalties: 3,
      winnerTeamId: 5,
    };
    const [m] = applyResults([{ ...baseKnockout, homeTeamId: 5, awayTeamId: 6 }], [result], []);
    expect(m.result).toMatchObject({ homePenalties: 4, awayPenalties: 3, winnerTeamId: 5 });
  });

  it('resolves knockout slots (home/away team ids)', () => {
    const slot: ResolvedSlotDTO = { matchId: 73, homeTeamId: 9, awayTeamId: 21 };
    const [m] = applyResults([baseKnockout], [], [slot]);
    expect(m.homeTeamId).toBe(9);
    expect(m.awayTeamId).toBe(21);
    expect(m.status).toBe('scheduled');
  });

  it('does not mutate the input match', () => {
    const result: MatchResultDTO = {
      matchId: 1,
      status: 'finished',
      homeScore: 3,
      awayScore: 0,
      homePenalties: null,
      awayPenalties: null,
      winnerTeamId: 1,
    };
    applyResults([baseGroup], [result], []);
    expect(baseGroup.status).toBe('scheduled');
    expect(baseGroup.result).toBeUndefined();
  });
});
