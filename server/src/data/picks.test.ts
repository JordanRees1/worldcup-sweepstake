import { describe, expect, it } from 'vitest';
import { normalizePicks } from './picks';
import { loadTeams } from './teams';

describe('normalizePicks', () => {
  const teams = loadTeams();
  const { players, picks } = normalizePicks(teams);
  const byRaw = (raw: string) => picks.find((p) => p.rawName === raw);
  const fifa = (code: string) => teams.find((t) => t.fifaCode === code);

  it('reads 6 players, each with 8 picks (48 total)', () => {
    expect(players).toHaveLength(6);
    expect(picks).toHaveLength(48);
    for (const player of players) {
      expect(picks.filter((p) => p.playerId === player.id)).toHaveLength(8);
    }
  });

  it('fixes typos to the right confirmed team', () => {
    expect(byRaw('Sengal')?.teamId).toBe(fifa('SEN')?.id);
    expect(byRaw('Uzbekisan')?.teamId).toBe(fifa('UZB')?.id);
  });

  it('maps name variants to the canonical team', () => {
    expect(byRaw('Ivory Coast')?.teamId).toBe(fifa('CIV')?.id);
    expect(byRaw('Iran')?.teamId).toBe(fifa('IRN')?.id);
    expect(byRaw('Curacao')?.teamId).toBe(fifa('CUR')?.id);
  });

  it('flags playoff-contingent picks as unmatched with a note', () => {
    for (const raw of ['Wales', 'Sweden', 'Iraq', 'DR Congo']) {
      const pick = byRaw(raw);
      expect(pick?.matched, raw).toBe(false);
      expect(pick?.note, raw).toContain('playoff-contingent');
    }
  });

  it('leaves nothing truly unmatched (all confirmed or contingent)', () => {
    const trulyUnmatched = picks.filter((p) => p.note === 'UNMATCHED — needs review');
    expect(trulyUnmatched).toEqual([]);
  });

  it('does not double-assign any confirmed team', () => {
    const matchedIds = picks.filter((p) => p.teamId !== null).map((p) => p.teamId);
    expect(new Set(matchedIds).size).toBe(matchedIds.length);
  });
});
