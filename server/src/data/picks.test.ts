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

  it('fixes typos to the right team', () => {
    expect(byRaw('Sengal')?.teamId).toBe(fifa('SEN')?.id);
    expect(byRaw('Uzbekisan')?.teamId).toBe(fifa('UZB')?.id);
  });

  it('maps name variants to the canonical team', () => {
    expect(byRaw('Ivory Coast')?.teamId).toBe(fifa('CIV')?.id);
    expect(byRaw('Iran')?.teamId).toBe(fifa('IRN')?.id);
    expect(byRaw('Curacao')?.teamId).toBe(fifa('CUR')?.id);
  });

  it('resolves the six qualified playoff winners to real teams', () => {
    expect(byRaw('Sweden')?.teamId).toBe(fifa('SWE')?.id);
    expect(byRaw('Turkiye')?.teamId).toBe(fifa('TUR')?.id);
    expect(byRaw('Czechia')?.teamId).toBe(fifa('CZE')?.id);
    expect(byRaw('DR Congo')?.teamId).toBe(fifa('COD')?.id);
    expect(byRaw('Iraq')?.teamId).toBe(fifa('IRQ')?.id);
    expect(byRaw('Bosnia')?.teamId).toBe(fifa('BIH')?.id);
  });

  it("matches Dec's swapped-in Croatia and leaves no dead picks", () => {
    expect(byRaw('Croatia')?.teamId).toBe(fifa('CRO')?.id);
    expect(picks.filter((p) => !p.matched)).toEqual([]);
  });

  it('leaves nothing truly unmatched', () => {
    const trulyUnmatched = picks.filter((p) => p.note === 'UNMATCHED — needs review');
    expect(trulyUnmatched).toEqual([]);
  });

  it('does not double-assign any team', () => {
    const ids = picks.filter((p) => p.teamId !== null).map((p) => p.teamId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
