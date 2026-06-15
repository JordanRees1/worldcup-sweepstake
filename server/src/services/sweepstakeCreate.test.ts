import { describe, expect, it } from 'vitest';
import { loadTeams } from '../data/teams';
import { generateRoster, type RosterInput } from './sweepstakeCreate';

const teams = loadTeams();

type Mode = 'chaos' | 'pots' | 'halves';

/** A roster of N blank-named players (the generator only needs the names). */
const roster = (n: number, mode: Mode, tpp: number): RosterInput & { generate: { mode: Mode } } => ({
  name: 'Test',
  teamsPerPlayer: tpp,
  players: Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, picks: [] })),
  generate: { mode },
});

// Deterministic rng so the draw is reproducible in tests.
const fixedRng = () => 0.42;

describe('generateRoster', () => {
  it('chaos: deals a clean 48-team partition, tpp per player', () => {
    const r = generateRoster(teams, roster(6, 'chaos', 8), fixedRng);
    expect(r.ok).toBe(true);
    expect(r.players).toHaveLength(6);
    expect(r.picks).toHaveLength(48);
    expect(new Set(r.picks!.map((p) => p.teamId)).size).toBe(48); // every team once
    for (const player of r.players!) {
      expect(r.picks!.filter((p) => p.playerId === player.id)).toHaveLength(8);
    }
  });

  it('pots: every player gets exactly one team from each ranking tier', () => {
    const tpp = 8;
    const players = 48 / tpp; // 6 → 6 teams per tier
    const r = generateRoster(teams, roster(players, 'pots', tpp), fixedRng);
    expect(r.ok).toBe(true);

    // Tier of a team = its index (0-based) in the rank-sorted list, divided by tier size.
    const ranked = [...teams].sort((a, b) => (a.fifaRank ?? 0) - (b.fifaRank ?? 0));
    const tierOf = new Map(ranked.map((t, i) => [t.id, Math.floor(i / players)]));

    for (const player of r.players!) {
      const tiers = r
        .picks!.filter((p) => p.playerId === player.id)
        .map((p) => tierOf.get(p.teamId));
      expect(new Set(tiers).size).toBe(tpp); // one team from each of the 8 tiers
    }
  });

  it('pots works for an odd teams-per-player', () => {
    const r = generateRoster(teams, roster(16, 'pots', 3), fixedRng);
    expect(r.ok).toBe(true);
    expect(r.picks).toHaveLength(48);
  });

  it('halves (even tpp): each player gets exactly half from the top 24, half from the bottom 24', () => {
    const tpp = 8;
    const r = generateRoster(teams, roster(48 / tpp, 'halves', tpp), fixedRng);
    expect(r.ok).toBe(true);

    const ranked = [...teams].sort((a, b) => (a.fifaRank ?? 0) - (b.fifaRank ?? 0));
    const topHalf = new Set(ranked.slice(0, 24).map((t) => t.id));
    for (const player of r.players!) {
      const mine = r.picks!.filter((p) => p.playerId === player.id);
      expect(mine.filter((p) => topHalf.has(p.teamId))).toHaveLength(tpp / 2);
    }
  });

  it('halves (odd tpp): top-half teams split as evenly as possible, all 24 used', () => {
    const tpp = 3; // 16 players, base 1 from each half + 1 extra to half the players
    const r = generateRoster(teams, roster(48 / tpp, 'halves', tpp), fixedRng);
    expect(r.ok).toBe(true);

    const ranked = [...teams].sort((a, b) => (a.fifaRank ?? 0) - (b.fifaRank ?? 0));
    const topHalf = new Set(ranked.slice(0, 24).map((t) => t.id));
    let topUsed = 0;
    for (const player of r.players!) {
      const top = r.picks!.filter((p) => p.playerId === player.id && topHalf.has(p.teamId)).length;
      expect(top === 1 || top === 2).toBe(true); // 1 or 2 strong sides — never lopsided
      topUsed += top;
    }
    expect(topUsed).toBe(24); // the whole top half is dealt exactly once
  });

  it('rejects a wrong player count', () => {
    const r = generateRoster(teams, roster(5, 'chaos', 8), fixedRng); // expected 6
    expect(r.ok).toBe(false);
    expect(r.errors?.[0]).toMatch(/expected 6 players/);
  });

  it('rejects duplicate player names', () => {
    const input = roster(6, 'chaos', 8);
    input.players[1].name = 'P1';
    const r = generateRoster(teams, input, fixedRng);
    expect(r.ok).toBe(false);
    expect(r.errors?.some((e) => /unique/.test(e))).toBe(true);
  });
});
