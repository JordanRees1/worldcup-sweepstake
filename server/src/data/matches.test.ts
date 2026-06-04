import { describe, expect, it } from 'vitest';
import { loadMatches } from './matches';
import { loadStages } from './stages';

describe('loadMatches', () => {
  const matches = loadMatches(loadStages());

  it('loads all 104 matches (72 group + 32 knockout)', () => {
    expect(matches).toHaveLength(104);
    expect(matches.filter((m) => m.stage === 'Group Stage')).toHaveLength(72);
  });

  it('fixes the match #100 label bug (W95 vs W100 -> W95 vs W96)', () => {
    expect(matches.find((m) => m.id === 100)?.label).toBe('W95 vs W96');
  });

  it('assigns a group to group-stage matches and none to knockouts', () => {
    const group = matches.find((m) => m.id === 1);
    expect(group?.group).toBe('A');
    expect(group?.homeTeamId).not.toBeNull();

    const knockout = matches.find((m) => m.id === 73);
    expect(knockout?.group).toBeUndefined();
    expect(knockout?.homeTeamId).toBeNull();
    expect(knockout?.awayTeamId).toBeNull();
  });

  it('parses every kickoff into a valid ISO timestamp with offset', () => {
    for (const m of matches) {
      expect(Number.isNaN(Date.parse(m.kickoffAt)), `match ${m.id}`).toBe(false);
    }
    expect(matches[0]?.kickoffAt).toBe('2026-06-11T15:00:00-06:00');
  });
});
