import type { Pick, Player } from '@sweepstake/shared';
import { describe, expect, it } from 'vitest';
import { loadDataset } from './dataset';
import { validateDataset } from './validate';

/**
 * The friends game (6 × 8) is covered by dataset.test.ts. These tests prove the
 * config-driven generalisation: the same 48-team field re-drafted as 24 players × 2
 * should validate, and mismatched pick rules should fail loudly.
 */
describe('validateDataset — per-sweepstake pick rules', () => {
  // Re-draft the real 48 picks into `players` groups of `teamsPerPlayer` each.
  function redraft(teamsPerPlayer: number) {
    const ds = loadDataset();
    const picks: Pick[] = ds.picks.map((p, i) => ({
      ...p,
      playerId: Math.floor(i / teamsPerPlayer) + 1,
    }));
    const count = ds.teams.length / teamsPerPlayer;
    const players: Player[] = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `P${i + 1}`,
    }));
    return {
      ...ds,
      players,
      picks,
      sweepstake: { ...ds.sweepstake, slug: 'test', name: 'Test', teamsPerPlayer },
    };
  }

  it('accepts a 24 × 2 draft of the same 48 teams', () => {
    expect(() => validateDataset(redraft(2))).not.toThrow();
  });

  it('accepts a 12 × 4 draft', () => {
    expect(() => validateDataset(redraft(4))).not.toThrow();
  });

  it('rejects a teamsPerPlayer that does not divide 48 evenly', () => {
    const ds = redraft(2);
    const broken = { ...ds, sweepstake: { ...ds.sweepstake, teamsPerPlayer: 5 } };
    expect(() => validateDataset(broken)).toThrow(/does not divide/i);
  });

  it('rejects when a player holds the wrong number of teams', () => {
    const ds = redraft(2);
    // Move one of player 2's picks to player 1 → player 1 has 3, player 2 has 1.
    const picks = ds.picks.map((p, i) => (i === 2 ? { ...p, playerId: 1 } : p));
    expect(() => validateDataset({ ...ds, picks })).toThrow(/expected 2/i);
  });
});
